from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

from .config import STATIC_DIR
from .db import SessionLocal, init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        from .services.rates import refresh_rates
        from .services.recurring import materialize_due

        try:
            refresh_rates(db)
        except Exception:
            pass  # offline is fine, we fall back to last known rates
        materialize_due(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Where's the Money, Lebowski", lifespan=lifespan)

from .routers import (  # noqa: E402
    accounts,
    auth,
    budgets,
    categories,
    dashboard,
    goals,
    ignore_rules,
    imports,
    loans,
    rates,
    rules,
    templates,
    transactions,
)

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(categories.router)
app.include_router(transactions.router)
app.include_router(templates.router)
app.include_router(budgets.router)
app.include_router(goals.router)
app.include_router(loans.router)
app.include_router(rules.router)
app.include_router(ignore_rules.router)
app.include_router(rates.router)
app.include_router(imports.router)
app.include_router(dashboard.router)


@app.get("/api/health")
def health():
    return {"ok": True}


if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        file = STATIC_DIR / path
        if path and file.is_file():
            return FileResponse(file)
        return FileResponse(STATIC_DIR / "index.html")
