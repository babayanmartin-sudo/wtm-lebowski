from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth import require_auth
from ..db import get_db
from ..models import Goal, GoalContribution
from ..schemas import ContributionIn, GoalIn, GoalOut

router = APIRouter(prefix="/api/goals", tags=["goals"], dependencies=[Depends(require_auth)])


def _out(goal: Goal) -> GoalOut:
    out = GoalOut.model_validate(goal)
    out.saved = round(sum(c.amount for c in goal.contributions), 2)
    return out


@router.get("", response_model=list[GoalOut])
def list_goals(db: Session = Depends(get_db)):
    goals = db.scalars(select(Goal).options(selectinload(Goal.contributions))).all()
    return [_out(g) for g in goals]


@router.post("", response_model=GoalOut, status_code=201)
def create_goal(body: GoalIn, db: Session = Depends(get_db)):
    g = Goal(**body.model_dump())
    db.add(g)
    db.commit()
    return _out(g)


@router.put("/{goal_id}", response_model=GoalOut)
def update_goal(goal_id: int, body: GoalIn, db: Session = Depends(get_db)):
    g = db.get(Goal, goal_id)
    if not g:
        raise HTTPException(404, "Goal not found")
    for key, value in body.model_dump().items():
        setattr(g, key, value)
    db.commit()
    return _out(g)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    g = db.get(Goal, goal_id)
    if not g:
        raise HTTPException(404, "Goal not found")
    db.delete(g)
    db.commit()


@router.post("/{goal_id}/contributions", response_model=GoalOut, status_code=201)
def add_contribution(goal_id: int, body: ContributionIn, db: Session = Depends(get_db)):
    g = db.get(Goal, goal_id)
    if not g:
        raise HTTPException(404, "Goal not found")
    g.contributions.append(GoalContribution(**body.model_dump()))
    db.commit()
    return _out(g)


@router.delete("/{goal_id}/contributions/{contribution_id}", response_model=GoalOut)
def delete_contribution(goal_id: int, contribution_id: int, db: Session = Depends(get_db)):
    c = db.get(GoalContribution, contribution_id)
    if not c or c.goal_id != goal_id:
        raise HTTPException(404, "Contribution not found")
    goal = c.goal
    db.delete(c)
    db.commit()
    db.refresh(goal)
    return _out(goal)
