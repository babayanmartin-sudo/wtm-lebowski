import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from ..auth import require_auth
from ..config import BASE_CURRENCY
from ..db import get_db
from ..models import Category, SavedReport, Split, Transaction
from ..schemas import ReportFiltersIn, SavedReportDetail, SavedReportIn, SavedReportOut
from .dashboard import _apply_filters, _by_category, _period, _series, _totals

router = APIRouter(prefix="/api/reports", tags=["reports"], dependencies=[Depends(require_auth)])


def _preview_for(db: Session, filters: ReportFiltersIn) -> dict:
    start, end = _period(filters.date_from, filters.date_to)
    if start > end:
        raise HTTPException(400, "date_from must be on or before date_to")

    cat_ids = filters.include_category_ids or None
    exclude_cat_ids = filters.exclude_category_ids or None

    totals = _totals(db, start, end, filters.account_id, cat_ids, exclude_cat_ids=exclude_cat_ids)
    granularity, series = _series(
        db, start, end, filters.account_id, cat_ids, exclude_cat_ids=exclude_cat_ids
    )

    income = round(totals.get("income") or 0.0, 2)
    expense = round(totals.get("expense") or 0.0, 2)

    count_stmt = select(Transaction.id).where(
        Transaction.date >= start, Transaction.date <= end, Transaction.kind.in_(["expense", "income"])
    )
    count_stmt = _apply_filters(count_stmt, filters.account_id, cat_ids, exclude_cat_ids=exclude_cat_ids)
    count = len(db.scalars(count_stmt).all())

    by_category = _by_category(db, start, end, filters.account_id, None, kind="expense")
    by_category_income = _by_category(db, start, end, filters.account_id, None, kind="income")
    if exclude_cat_ids:
        excluded = set(exclude_cat_ids)
        by_category = [c for c in by_category if c["category_id"] not in excluded]
        by_category_income = [c for c in by_category_income if c["category_id"] not in excluded]
    if cat_ids:
        included = set(cat_ids)
        by_category = [c for c in by_category if c["category_id"] in included]
        by_category_income = [c for c in by_category_income if c["category_id"] in included]

    return {
        "base_currency": BASE_CURRENCY,
        "date_from": start.isoformat(),
        "date_to": end.isoformat(),
        "total": round(income + expense, 2),
        "income": income,
        "expense": expense,
        "count": count,
        "average": round((income + expense) / count, 2) if count else 0.0,
        "by_category": by_category,
        "by_category_income": by_category_income,
        "series": series,
        "series_granularity": granularity,
    }


@router.post("/preview")
def preview(body: ReportFiltersIn, db: Session = Depends(get_db)):
    return _preview_for(db, body)


@router.get("", response_model=list[SavedReportOut])
def list_reports(db: Session = Depends(get_db)):
    return db.scalars(select(SavedReport).order_by(SavedReport.created_at.desc())).all()


@router.post("", response_model=SavedReportDetail)
def create_report(body: SavedReportIn, db: Session = Depends(get_db)):
    row = SavedReport(name=body.name, description=body.description, filters=body.filters)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/{report_id}", response_model=SavedReportDetail)
def get_report(report_id: int, db: Session = Depends(get_db)):
    row = db.get(SavedReport, report_id)
    if not row:
        raise HTTPException(404, "Report not found")
    return row


@router.delete("/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db)):
    row = db.get(SavedReport, report_id)
    if not row:
        raise HTTPException(404, "Report not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/{report_id}/export.csv")
def export_report_csv(report_id: int, db: Session = Depends(get_db)):
    row = db.get(SavedReport, report_id)
    if not row:
        raise HTTPException(404, "Report not found")
    filters = ReportFiltersIn(**row.filters)
    start, end = _period(filters.date_from, filters.date_to)
    cat_ids = filters.include_category_ids or None
    exclude_cat_ids = filters.exclude_category_ids or None

    categories = {c.id: c for c in db.scalars(select(Category))}
    stmt = (
        select(Transaction.date, Transaction.payee, Split.category_id, Split.amount_base)
        .join(Split, Split.transaction_id == Transaction.id)
        .where(
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.kind.in_(["expense", "income"]),
        )
    )
    stmt = _apply_filters(stmt, filters.account_id, cat_ids, exclude_cat_ids=exclude_cat_ids)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["date", "payee", "category", "amount"])
    for d, payee, category_id, amount in db.execute(stmt.order_by(Transaction.date)).all():
        cat = categories.get(category_id)
        writer.writerow([d.isoformat(), payee, cat.name if cat else "Uncategorized", amount])
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{row.name or "report"}.csv"'},
    )
