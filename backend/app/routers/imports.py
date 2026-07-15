import imaplib
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..models import Account, ColumnPreset, Import, ImportRow, Split, Transaction
from ..schemas import (
    AmazonSyncResult,
    ImportDetail,
    ImportOut,
    MappingIn,
    MashreqSyncResult,
    MashreqTestIn,
    MashreqTestResult,
    RowPatch,
)
from ..services import importer
from ..services.amazon_email import fetch_unseen_orders, fetch_unseen_refunds, parse_order_items, parse_refund_items
from ..services.mashreq_email import fetch_unseen_alerts, parse_alert
from ..services.mashreq_email import test_connection as mashreq_test_connection
from ..services.matcher import is_ignored, learn, learn_ignore, normalize, suggest
from ..services.rates import to_base
from ..services.settings import (
    AMAZON_DEFAULT_ACCOUNT_ID_KEY,
    AMAZON_SYNC_ENABLED_KEY,
    DEFAULT_MASHREQ_IMAP_FOLDER,
    DEFAULT_MASHREQ_IMAP_PORT,
    MASHREQ_CARD_ACCOUNTS_KEY,
    MASHREQ_IMAP_FOLDER_KEY,
    MASHREQ_IMAP_HOST_KEY,
    MASHREQ_IMAP_PASSWORD_KEY,
    MASHREQ_IMAP_PORT_KEY,
    MASHREQ_IMAP_USER_KEY,
    MASHREQ_SYNC_ENABLED_KEY,
    get_bool_setting,
    get_float_setting,
    get_str_setting,
)

router = APIRouter(prefix="/api/imports", tags=["imports"], dependencies=[Depends(require_auth)])


@router.post("", response_model=ImportDetail, status_code=201)
async def upload(
    file: UploadFile = File(...),
    account_id: int = Form(...),
    db: Session = Depends(get_db),
):
    if not db.get(Account, account_id):
        raise HTTPException(400, "Account not found")
    content = await file.read()
    try:
        rows, header_idx = importer.parse_file(file.filename or "statement.csv", content)
    except ValueError as e:
        raise HTTPException(400, str(e))

    headers = rows[header_idx]
    imp = Import(filename=file.filename or "statement.csv", account_id=account_id, headers=headers)
    for i, raw in enumerate(rows[header_idx + 1 :]):
        imp.rows.append(ImportRow(row_index=i, raw=raw))

    preset = importer.find_preset(db, headers)
    if preset:
        imp.mapping = preset.mapping
        imp.options = preset.options
        imp.status = "preview"
    else:
        imp.mapping = importer.guess_mapping(headers)
        imp.status = "mapping"
    db.add(imp)
    db.commit()
    if preset:
        importer.apply_mapping(db, imp)
    return imp


@router.post("/mashreq-test", response_model=MashreqTestResult)
def mashreq_test(body: MashreqTestIn, db: Session = Depends(get_db)):
    """Test the IMAP connection with the given (possibly unsaved) form
    values, falling back to whatever's already saved for any field left
    blank — lets the Profile page's 'Test connection' button check
    in-progress edits without requiring a save first."""
    host = body.mashreq_imap_host or get_str_setting(db, MASHREQ_IMAP_HOST_KEY, "")
    user = body.mashreq_imap_user or get_str_setting(db, MASHREQ_IMAP_USER_KEY, "")
    password = body.mashreq_imap_password or get_str_setting(db, MASHREQ_IMAP_PASSWORD_KEY, "")
    port = body.mashreq_imap_port or get_str_setting(db, MASHREQ_IMAP_PORT_KEY, DEFAULT_MASHREQ_IMAP_PORT)
    folder = body.mashreq_imap_folder or get_str_setting(db, MASHREQ_IMAP_FOLDER_KEY, DEFAULT_MASHREQ_IMAP_FOLDER)
    if not host or not user or not password:
        return MashreqTestResult(ok=False, message="Host, username, and password are required")
    ok, message = mashreq_test_connection(host, port, user, password, folder)
    return MashreqTestResult(ok=ok, message=message)


@router.post("/mashreq-sync", response_model=MashreqSyncResult)
def mashreq_sync(db: Session = Depends(get_db)):
    if not get_bool_setting(db, MASHREQ_SYNC_ENABLED_KEY, False):
        raise HTTPException(400, "Enable Mashreq sync in Profile first")
    host = get_str_setting(db, MASHREQ_IMAP_HOST_KEY, "")
    user = get_str_setting(db, MASHREQ_IMAP_USER_KEY, "")
    password = get_str_setting(db, MASHREQ_IMAP_PASSWORD_KEY, "")
    port = get_str_setting(db, MASHREQ_IMAP_PORT_KEY, DEFAULT_MASHREQ_IMAP_PORT)
    folder = get_str_setting(db, MASHREQ_IMAP_FOLDER_KEY, DEFAULT_MASHREQ_IMAP_FOLDER)
    if not host or not user or not password:
        raise HTTPException(400, "Configure Mashreq sync in Profile first")

    try:
        card_accounts: dict[str, int] = json.loads(
            get_str_setting(db, MASHREQ_CARD_ACCOUNTS_KEY, "{}") or "{}"
        )
    except ValueError:
        card_accounts = {}

    try:
        alerts = fetch_unseen_alerts(host, port, user, password, folder)
    except OSError as e:
        raise HTTPException(502, f"Couldn't reach the mailbox: {e}")
    except imaplib.IMAP4.error as e:
        raise HTTPException(502, f"IMAP error: {e}")

    by_account: dict[int, list] = {}
    unmapped_count = 0
    unparsed_count = 0
    for subject, body in alerts:
        parsed = parse_alert(subject, body)
        if not parsed:
            unparsed_count += 1
            continue
        account_id = card_accounts.get(parsed.card_suffix)
        if account_id is None:
            unmapped_count += 1
            continue
        by_account.setdefault(account_id, []).append(parsed)

    summaries = []
    for account_id, parsed_alerts in by_account.items():
        imp = Import(
            filename=f"Mashreq sync {parsed_alerts[0].date.date().isoformat()}",
            account_id=account_id,
            status="preview",
            mapping={},
        )
        for i, alert in enumerate(parsed_alerts):
            imp.rows.append(
                ImportRow(
                    row_index=i,
                    raw=[f"{alert.merchant} — {alert.date.isoformat()}"],
                    parsed_date=alert.date.date(),
                    parsed_amount=-alert.amount,
                    parsed_payee=alert.merchant,
                )
            )
        db.add(imp)
        db.commit()
        importer.finalize_rows(db, imp)
        summaries.append({"id": imp.id, "account_id": account_id, "count": len(parsed_alerts)})

    return MashreqSyncResult(imports=summaries, unmapped_count=unmapped_count, unparsed_count=unparsed_count)


@router.post("/amazon-sync", response_model=AmazonSyncResult)
def amazon_sync(db: Session = Depends(get_db)):
    if not get_bool_setting(db, AMAZON_SYNC_ENABLED_KEY, False):
        raise HTTPException(400, "Enable Amazon sync in Profile first")
    host = get_str_setting(db, MASHREQ_IMAP_HOST_KEY, "")
    user = get_str_setting(db, MASHREQ_IMAP_USER_KEY, "")
    password = get_str_setting(db, MASHREQ_IMAP_PASSWORD_KEY, "")
    port = get_str_setting(db, MASHREQ_IMAP_PORT_KEY, DEFAULT_MASHREQ_IMAP_PORT)
    folder = get_str_setting(db, MASHREQ_IMAP_FOLDER_KEY, DEFAULT_MASHREQ_IMAP_FOLDER)
    if not host or not user or not password:
        raise HTTPException(400, "Configure the sync mailbox in Profile first")

    account_id_float = get_float_setting(db, AMAZON_DEFAULT_ACCOUNT_ID_KEY, None)
    if account_id_float is None:
        raise HTTPException(400, "Set a default Amazon account in Profile first")
    account_id = int(account_id_float)

    try:
        order_emails = fetch_unseen_orders(host, port, user, password, folder)
        refund_emails = fetch_unseen_refunds(host, port, user, password, folder)
    except OSError as e:
        raise HTTPException(502, f"Couldn't reach the mailbox: {e}")
    except imaplib.IMAP4.error as e:
        raise HTTPException(502, f"IMAP error: {e}")

    items = []
    unparsed_count = 0
    for subject, body, received in order_emails:
        parsed = parse_order_items(subject, body, received)
        if not parsed:
            unparsed_count += 1
            continue
        items.extend(parsed)
    for subject, body, received in refund_emails:
        parsed = parse_refund_items(subject, body, received)
        if not parsed:
            unparsed_count += 1
            continue
        items.extend(parsed)

    if not items:
        return AmazonSyncResult(imported_count=0, unparsed_count=unparsed_count, import_id=None)

    imp = Import(
        filename=f"Amazon sync {items[0].date.isoformat()}",
        account_id=account_id,
        status="preview",
        mapping={},
    )
    for i, item in enumerate(items):
        imp.rows.append(
            ImportRow(
                row_index=i,
                raw=[item.name],
                parsed_date=item.date,
                parsed_amount=item.price if item.is_refund else -item.price,
                parsed_payee=item.name,
                kind="expense_return" if item.is_refund else None,
            )
        )
    db.add(imp)
    db.commit()
    importer.finalize_rows(db, imp)

    return AmazonSyncResult(imported_count=len(items), unparsed_count=unparsed_count, import_id=imp.id)


@router.get("/{import_id}", response_model=ImportDetail)
def get_import(import_id: int, db: Session = Depends(get_db)):
    imp = db.get(Import, import_id)
    if not imp:
        raise HTTPException(404, "Import not found")
    return imp


@router.post("/{import_id}/mapping", response_model=ImportDetail)
def set_mapping(import_id: int, body: MappingIn, db: Session = Depends(get_db)):
    imp = db.get(Import, import_id)
    if not imp:
        raise HTTPException(404, "Import not found")
    if "date" not in body.mapping or not (
        "amount" in body.mapping or "debit" in body.mapping or "credit" in body.mapping
    ):
        raise HTTPException(400, "Mapping needs at least date and amount (or debit/credit)")
    imp.mapping = body.mapping
    imp.options = body.options
    imp.status = "preview"
    # reset per-row categories so re-mapping re-suggests
    for row in imp.rows:
        row.category_id = None
        row.suggested_category_id = None
        row.skip = False

    signature = importer.header_signature(imp.headers)
    preset = db.scalar(select(ColumnPreset).where(ColumnPreset.header_signature == signature))
    if preset:
        preset.mapping = body.mapping
        preset.options = body.options
        if body.preset_name:
            preset.name = body.preset_name
    else:
        db.add(
            ColumnPreset(
                name=body.preset_name or imp.filename,
                header_signature=signature,
                mapping=body.mapping,
                options=body.options,
            )
        )
    db.commit()
    importer.apply_mapping(db, imp)
    return imp


@router.patch("/{import_id}/rows/{row_id}", response_model=ImportDetail)
def patch_row(import_id: int, row_id: int, body: RowPatch, db: Session = Depends(get_db)):
    row = db.get(ImportRow, row_id)
    if not row or row.import_id != import_id:
        raise HTTPException(404, "Row not found")
    imp = row.import_
    fields = body.model_fields_set
    if "category_id" in fields:
        norm_payee = normalize(row.parsed_payee)
        siblings = (
            [r for r in imp.rows if not r.error and normalize(r.parsed_payee) == norm_payee]
            if norm_payee
            else [row]
        )
        for sibling in siblings:
            sibling.category_id = body.category_id
        if body.category_id and row.parsed_payee:
            learn(db, row.parsed_payee, body.category_id)
    if "skip" in fields:
        row.skip = body.skip
    if "is_duplicate" in fields:
        row.is_duplicate = body.is_duplicate
        if body.is_duplicate is False:
            row.skip = False
    if "kind" in fields:
        row.kind = body.kind
    db.commit()
    return imp


@router.post("/{import_id}/rows/{row_id}/ignore", response_model=ImportDetail)
def ignore_row(import_id: int, row_id: int, db: Session = Depends(get_db)):
    """Mark this row and every same-merchant row in this import as ignored,
    and remember the merchant so future imports auto-skip it too."""
    row = db.get(ImportRow, row_id)
    if not row or row.import_id != import_id:
        raise HTTPException(404, "Row not found")
    if not row.parsed_payee:
        raise HTTPException(400, "Row has no payee text to build an ignore rule from")
    imp = row.import_
    norm_payee = normalize(row.parsed_payee)
    for sibling in imp.rows:
        if not sibling.error and normalize(sibling.parsed_payee) == norm_payee:
            sibling.skip = True
            sibling.ignored = True
            sibling.category_id = None
    learn_ignore(db, row.parsed_payee)
    db.commit()
    return imp


@router.post("/{import_id}/commit", response_model=ImportOut)
def commit_import(import_id: int, db: Session = Depends(get_db)):
    imp = db.get(Import, import_id)
    if not imp:
        raise HTTPException(404, "Import not found")
    if imp.status != "preview":
        raise HTTPException(400, "Import is not ready to commit")
    account = imp.account
    created = 0
    for row in imp.rows:
        if row.error or row.parsed_date is None or row.parsed_amount is None:
            continue
        # rule/ignore-rule hit stats only move once a row is actually part of
        # a committed import — preview-time matching runs with record_hits=False.
        # Duplicate-skipped rows never become transactions, so they don't count
        # either; only rows genuinely excluded by an ignore rule, or rows that
        # become a real transaction, bump their matching rule's hit_count.
        if row.ignored and row.parsed_payee:
            is_ignored(db, row.parsed_payee, record_hits=True)
        elif (
            not row.is_duplicate
            and row.parsed_payee
            and row.suggestion_confidence in ("exact", "rule")
        ):
            suggest(db, row.parsed_payee, record_hits=True)
        if row.skip:
            continue
        kind = "expense" if row.parsed_amount < 0 else "income"
        amount = round(abs(row.parsed_amount), 2)
        tx = Transaction(
            date=row.parsed_date,
            kind=kind,
            account_id=imp.account_id,
            amount=amount,
            currency=account.currency,
            amount_base=to_base(db, amount, account.currency, row.parsed_date),
            payee=row.parsed_payee,
            note=row.parsed_note,
            import_id=imp.id,
            dedupe_hash=row.dedupe_hash,
        )
        tx.splits.append(
            Split(
                category_id=row.category_id,
                amount=amount,
                amount_base=tx.amount_base,
            )
        )
        db.add(tx)
        created += 1
        # user picked something the matcher didn't suggest -> learn it
        if row.category_id and row.category_id != row.suggested_category_id and row.parsed_payee:
            learn(db, row.parsed_payee, row.category_id)
    imp.status = "done"
    db.commit()
    return imp


@router.delete("/{import_id}", status_code=204)
def cancel_import(import_id: int, db: Session = Depends(get_db)):
    imp = db.get(Import, import_id)
    if not imp:
        raise HTTPException(404, "Import not found")
    db.delete(imp)
    db.commit()
