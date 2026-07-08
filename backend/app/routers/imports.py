from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..models import Account, ColumnPreset, Import, ImportRow, Split, Transaction
from ..schemas import ImportDetail, ImportOut, MappingIn, RowPatch
from ..services import importer
from ..services.matcher import is_ignored, learn, learn_ignore, normalize, suggest
from ..services.rates import to_base

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
