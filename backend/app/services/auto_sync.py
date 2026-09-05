import asyncio
import logging
from datetime import datetime, timezone

from ..db import SessionLocal
from .settings import (
    AUTO_SYNC_ENABLED_KEY,
    AUTO_SYNC_FREQUENCY_KEY,
    AUTO_SYNC_LAST_RUN_KEY,
    DEFAULT_AUTO_SYNC_FREQUENCY_MINUTES,
    get_bool_setting,
    get_float_setting,
    get_str_setting,
    set_str_setting,
)

logger = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS = 60


async def auto_sync_loop() -> None:
    while True:
        try:
            run_due_sync()
        except Exception:
            logger.exception("auto-sync tick failed")
        try:
            run_due_templates()
        except Exception:
            logger.exception("template auto-post tick failed")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


def run_due_templates() -> None:
    """Posts any due auto_post templates. Runs every tick unconditionally
    (unlike mailbox auto-sync, template auto-post has no on/off setting of
    its own — it's per-template via Template.auto_post) — otherwise a
    template due on the 1st would only post once someone happens to open
    the app or edit the template that day."""
    from .recurring import materialize_due

    db = SessionLocal()
    try:
        materialize_due(db)
    finally:
        db.close()


def run_due_sync() -> None:
    """Runs Mashreq + Amazon sync if auto-sync is enabled and the
    configured frequency has elapsed since the last run. Called on a
    fixed-interval poll rather than a precise scheduler — good enough at
    a minimum 15-minute granularity for a single-user app."""
    from ..routers.imports import _run_amazon_sync, _run_mashreq_sync

    db = SessionLocal()
    try:
        if not get_bool_setting(db, AUTO_SYNC_ENABLED_KEY, False):
            return
        frequency = (
            get_float_setting(db, AUTO_SYNC_FREQUENCY_KEY, DEFAULT_AUTO_SYNC_FREQUENCY_MINUTES)
            or DEFAULT_AUTO_SYNC_FREQUENCY_MINUTES
        )
        now = datetime.now(timezone.utc)
        last_run_raw = get_str_setting(db, AUTO_SYNC_LAST_RUN_KEY, "")
        if last_run_raw:
            last_run = datetime.fromisoformat(last_run_raw)
            if (now - last_run).total_seconds() < frequency * 60:
                return

        try:
            _run_mashreq_sync(db, trigger="auto")
        except Exception:
            logger.exception("auto Mashreq sync failed")
        try:
            _run_amazon_sync(db, trigger="auto")
        except Exception:
            logger.exception("auto Amazon sync failed")

        set_str_setting(db, AUTO_SYNC_LAST_RUN_KEY, now.isoformat())
        db.commit()
    finally:
        db.close()
