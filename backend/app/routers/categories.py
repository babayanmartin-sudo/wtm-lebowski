from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..models import Category, Split
from ..schemas import CategoryIn, CategoryOut

router = APIRouter(prefix="/api/categories", tags=["categories"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.scalars(select(Category).order_by(Category.sort_order, Category.id)).all()


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(body: CategoryIn, db: Session = Depends(get_db)):
    _validate_parent(db, body, None)
    cat = Category(**body.model_dump())
    db.add(cat)
    db.commit()
    return cat


@router.put("/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, body: CategoryIn, db: Session = Depends(get_db)):
    cat = db.get(Category, category_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    _validate_parent(db, body, category_id)
    for key, value in body.model_dump().items():
        setattr(cat, key, value)
    db.commit()
    return cat


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.get(Category, category_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    child_ids = [c.id for c in cat.children] + [category_id]
    used = db.scalar(select(Split.id).where(Split.category_id.in_(child_ids)).limit(1))
    if used:
        raise HTTPException(400, "Category is used by transactions — archive it instead")
    db.delete(cat)
    db.commit()


def _validate_parent(db: Session, body: CategoryIn, self_id: int | None) -> None:
    if body.parent_id is None:
        return
    if body.parent_id == self_id:
        raise HTTPException(400, "Category cannot be its own parent")
    parent = db.get(Category, body.parent_id)
    if not parent:
        raise HTTPException(400, "Parent category not found")
    if parent.parent_id is not None:
        raise HTTPException(400, "Only one nesting level is supported")
    if parent.kind != body.kind:
        raise HTTPException(400, "Subcategory must match parent kind")
