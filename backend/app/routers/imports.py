import imaplib
from dataclasses import dataclass

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..models import Account, ColumnPreset, Import, ImportRow, Split, SyncLog, Transaction
from ..schemas import (
    AmazonSyncResult,
    ImportDetail,
    ImportOut,
    MappingIn,
    MashreqSyncResult,
    MashreqTestIn,
    MashreqTestResult,
    PendingImportSummary,
    RowPatch,
    SyncAllResult,
    SyncLogOut,
)
from ..services import importer
from ..services.amazon_email import fetch_unseen_orders, fetch_unseen_refunds, parse_order_items, parse_refund_items
from ..services.mashreq_email import fetch_unseen_alerts, parse_alert
from ..services.mashreq_email import test_connection as mashreq_test_connection
from ..services.matcher import is_ignored, learn, learn_ignore, normalize, suggest
from ..services.rates import convert, to_base
from ..services.settings import (
    AMAZON_DEFAULT_ACCOUNT_ID_KEY,
    AMAZON_SYNC_ENABLED_KEY,
    DEFAULT_SYNC_IMAP_FOLDER,
    DEFAULT_SYNC_IMAP_PORT,
    MASHREQ_SYNC_ENABLED_KEY,
    SYNC_IMAP_FOLDER_KEY,
    SYNC_IMAP_HOST_KEY,
    SYNC_IMAP_PASSWORD_KEY,
    SYNC_IMAP_PORT_KEY,
    SYNC_IMAP_USER_KEY,
    get_bool_setting,
    get_card_accounts,
    get_int_setting,
    get_str_setting,
)

router = APIRouter(prefix="/api/imports", tags=["imports"], dependencies=[Depends(require_auth)])


@dataclass
class MailboxSettings:
    host: str
    port: str
    user: str
    password: str
    folder: str

    @property
    def configured(self) -> bool:
        return bool(self.host and self.user and self.password)


def _load_mailbox_settings(db: Session) -> MailboxSettings:
    """Shared IMAP mailbox config — one mailbox backs both Mashreq and
    Amazon sync by design, so this is loaded once instead of duplicated
    per sync function."""
    return MailboxSettings(
        host=get_str_setting(db, SYNC_IMAP_HOST_KEY, "") or "",
        port=get_str_setting(db, SYNC_IMAP_PORT_KEY, DEFAULT_SYNC_IMAP_PORT) or DEFAULT_SYNC_IMAP_PORT,
        user=get_str_setting(db, SYNC_IMAP_USER_KEY, "") or "",
        password=get_str_setting(db, SYNC_IMAP_PASSWORD_KEY, "") or "",
        folder=get_str_setting(db, SYNC_IMAP_FOLDER_KEY, DEFAULT_SYNC_IMAP_FOLDER) or DEFAULT_SYNC_IMAP_FOLDER,
    )


SYNC_LOG_RETENTION = 200


def _record_sync(db: Session, **fields) -> None:
    """Insert a SyncLog row and trim the table to the most recent
    SYNC_LOG_RETENTION entries — otherwise this grows forever, one row
    per sync attempt (auto-sync ticks every 15+ min)."""
    db.add(SyncLog(**fields))
    db.commit()
    stale_ids = db.scalars(
        select(SyncLog.id).order_by(SyncLog.ran_at.desc()).offset(SYNC_LOG_RETENTION)
    ).all()
    if stale_ids:
        db.query(SyncLog).filter(SyncLog.id.in_(stale_ids)).delete(synchronize_session=False)
        db.commit()


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
    saved = _load_mailbox_settings(db)
    host = body.mashreq_imap_host or saved.host
    user = body.mashreq_imap_user or saved.user
    password = body.mashreq_imap_password or saved.password
    port = body.mashreq_imap_port or saved.port
    folder = body.mashreq_imap_folder or saved.folder
    if not host or not user or not password:
        return MashreqTestResult(ok=False, message="Host, username, and password are required")
    ok, message = mashreq_test_connection(host, port, user, password, folder)
    return MashreqTestResult(ok=ok, message=message)


def _run_mashreq_sync(db: Session, trigger: str = "manual") -> MashreqSyncResult | None:
    """Core Mashreq sync logic, reused by the manual endpoint, /sync-all,
    and the auto-sync scheduler. Returns None if the mailbox isn't
    configured (nothing to do), rather than raising. Parsed alerts are
    committed straight to transactions (unlike a CSV import, there's no
    column-mapping step to review) — an unrecognized category just lands
    as Uncategorized for later cleanup. Every attempt that actually
    reaches the mailbox is recorded to SyncLog — alerts get marked
    \\Seen whether or not they end up imported, so this is the only
    place that surfaces unmapped/unparsed counts outside a manual
    sync's toast."""
    mailbox = _load_mailbox_settings(db)
    if not mailbox.configured:
        return None
    card_accounts = get_card_accounts(db)

    try:
        alerts = fetch_unseen_alerts(mailbox.host, mailbox.port, mailbox.user, mailbox.password, mailbox.folder)
    except OSError as e:
        _record_sync(db, source="mashreq", trigger=trigger, error=f"Couldn't reach the mailbox: {e}")
        raise HTTPException(502, f"Couldn't reach the mailbox: {e}")
    except imaplib.IMAP4.error as e:
        _record_sync(db, source="mashreq", trigger=trigger, error=f"IMAP error: {e}")
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
        account = db.get(Account, account_id)
        imp = Import(
            filename=f"Mashreq sync {parsed_alerts[0].date.date().isoformat()}",
            account_id=account_id,
            status="preview",
            mapping={},
        )
        for i, alert in enumerate(parsed_alerts):
            # the alert states the purchase in its original currency (e.g. a
            # EUR purchase abroad) — convert to the account's own currency so
            # parsed_amount means what the CSV-import path assumes it means
            amount = alert.amount
            if account and alert.currency != account.currency:
                amount = convert(db, alert.amount, alert.currency, account.currency, alert.date.date())
            imp.rows.append(
                ImportRow(
                    row_index=i,
                    raw=[f"{alert.merchant} — {alert.date.isoformat()} ({alert.currency} {alert.amount})"],
                    parsed_date=alert.date.date(),
                    parsed_amount=-amount,
                    parsed_payee=alert.merchant,
                )
            )
        db.add(imp)
        db.commit()
        importer.finalize_rows(db, imp)
        _commit_import(db, imp)
        db.commit()
        summaries.append({"id": imp.id, "account_id": account_id, "count": len(parsed_alerts)})

    imported_count = sum(s["count"] for s in summaries)
    _record_sync(
        db,
        source="mashreq",
        trigger=trigger,
        imported_count=imported_count,
        unmapped_count=unmapped_count,
        unparsed_count=unparsed_count,
    )

    return MashreqSyncResult(imports=summaries, unmapped_count=unmapped_count, unparsed_count=unparsed_count)


@router.post("/mashreq-sync", response_model=MashreqSyncResult)
def mashreq_sync(db: Session = Depends(get_db)):
    if not get_bool_setting(db, MASHREQ_SYNC_ENABLED_KEY, False):
        raise HTTPException(400, "Enable Mashreq sync in Profile first")
    result = _run_mashreq_sync(db)
    if result is None:
        raise HTTPException(400, "Configure Mashreq sync in Profile first")
    return result


def _run_amazon_sync(db: Session, trigger: str = "manual") -> AmazonSyncResult | None:
    """Core Amazon sync logic, reused by the manual endpoint, /sync-all,
    and the auto-sync scheduler. Returns None if the mailbox or default
    account isn't configured (nothing to do), rather than raising. Parsed
    orders are committed straight to transactions (unlike a CSV import,
    there's no column-mapping step to review) — an unrecognized category
    just lands as Uncategorized for later cleanup. Every attempt that
    actually reaches the mailbox is recorded to SyncLog."""
    mailbox = _load_mailbox_settings(db)
    if not mailbox.configured:
        return None

    account_id = get_int_setting(db, AMAZON_DEFAULT_ACCOUNT_ID_KEY, None)
    if account_id is None:
        return None

    try:
        order_emails = fetch_unseen_orders(mailbox.host, mailbox.port, mailbox.user, mailbox.password, mailbox.folder)
        refund_emails = fetch_unseen_refunds(mailbox.host, mailbox.port, mailbox.user, mailbox.password, mailbox.folder)
    except OSError as e:
        _record_sync(db, source="amazon", trigger=trigger, error=f"Couldn't reach the mailbox: {e}")
        raise HTTPException(502, f"Couldn't reach the mailbox: {e}")
    except imaplib.IMAP4.error as e:
        _record_sync(db, source="amazon", trigger=trigger, error=f"IMAP error: {e}")
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
        _record_sync(db, source="amazon", trigger=trigger, unparsed_count=unparsed_count)
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
    _commit_import(db, imp)
    db.commit()
    _record_sync(db, source="amazon", trigger=trigger, imported_count=len(items), unparsed_count=unparsed_count)

    return AmazonSyncResult(imported_count=len(items), unparsed_count=unparsed_count, import_id=imp.id)


@router.post("/amazon-sync", response_model=AmazonSyncResult)
def amazon_sync(db: Session = Depends(get_db)):
    if not get_bool_setting(db, AMAZON_SYNC_ENABLED_KEY, False):
        raise HTTPException(400, "Enable Amazon sync in Profile first")
    result = _run_amazon_sync(db)
    if result is None:
        raise HTTPException(400, "Configure the sync mailbox and default Amazon account in Profile first")
    return result


@router.post("/sync-all", response_model=SyncAllResult)
def sync_all(db: Session = Depends(get_db)):
    """Runs Mashreq + Amazon sync once, immediately — regardless of their
    individual manual-button toggles — for use when auto-sync is off."""
    mashreq_result = None
    amazon_result = None
    errors: list[str] = []
    try:
        mashreq_result = _run_mashreq_sync(db)
    except HTTPException as e:
        errors.append(f"Mashreq: {e.detail}")
    try:
        amazon_result = _run_amazon_sync(db)
    except HTTPException as e:
        errors.append(f"Amazon: {e.detail}")
    return SyncAllResult(mashreq=mashreq_result, amazon=amazon_result, errors=errors)


@router.get("/sync-log", response_model=list[SyncLogOut])
def get_sync_log(limit: int = 50, db: Session = Depends(get_db)):
    return db.scalars(select(SyncLog).order_by(SyncLog.ran_at.desc()).limit(min(limit, 200))).all()


@router.get("/pending", response_model=list[PendingImportSummary])
def get_pending_imports(db: Session = Depends(get_db)):
    """Imports (CSV upload or Mashreq/Amazon sync) that were parsed but
    never committed to real transactions — otherwise invisible once
    created outside the upload flow (e.g. by auto-sync), since there was
    no way to list them."""
    imps = db.scalars(
        select(Import).where(Import.status.in_(("mapping", "preview"))).order_by(Import.created_at.desc())
    ).all()
    return [
        PendingImportSummary(
            id=imp.id,
            filename=imp.filename,
            account_id=imp.account_id,
            account_name=imp.account.name,
            status=imp.status,
            created_at=imp.created_at,
            row_count=len(imp.rows),
        )
        for imp in imps
    ]


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


@router.post("/{import_id}/unmark-all-duplicates", response_model=ImportDetail)
def unmark_all_duplicates(import_id: int, db: Session = Depends(get_db)):
    """Bulk version of patch_row's is_duplicate=False — for a legitimate
    bulk-import scenario (e.g. an initial historical dump where many
    rows share date+amount by coincidence, not because they're actually
    duplicates) clicking "not a duplicate" one row at a time doesn't
    scale to hundreds of rows."""
    imp = db.get(Import, import_id)
    if not imp:
        raise HTTPException(404, "Import not found")
    for row in imp.rows:
        if row.is_duplicate:
            row.is_duplicate = False
            row.skip = False
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


def _commit_import(db: Session, imp: Import) -> int:
    """Turn an import's parsed rows into real Transactions. Shared by the
    manual review screen's commit button and pre-parsed sources (Mashreq/
    Amazon sync) that skip the review step entirely and commit
    immediately — both need identical rule-learning/dedupe handling."""
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
    return created


@router.post("/{import_id}/commit", response_model=ImportOut)
def commit_import(import_id: int, db: Session = Depends(get_db)):
    imp = db.get(Import, import_id)
    if not imp:
        raise HTTPException(404, "Import not found")
    if imp.status != "preview":
        raise HTTPException(400, "Import is not ready to commit")
    _commit_import(db, imp)
    db.commit()
    return imp


@router.delete("/{import_id}", status_code=204)
def cancel_import(import_id: int, db: Session = Depends(get_db)):
    imp = db.get(Import, import_id)
    if not imp:
        raise HTTPException(404, "Import not found")
    db.delete(imp)
    db.commit()
