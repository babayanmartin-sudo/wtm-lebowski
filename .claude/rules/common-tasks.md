# Common Tasks

## Add a new transaction field

1. **Model** (models.py: Transaction): add Mapped[type] = mapped_column(...)
2. **Schema** (schemas.py: TransactionIn/Out): add field
3. **Router** (transactions.py): extract from request body in _build()
4. **Migration** (db.py:_migrate): add ALTER TABLE check if not existing in tests
5. **Tests**: verify field persists round-trip

## Add a new category breakdown in Dashboard

1. **Router** (dashboard.py): extend _by_category() logic or add new function
2. **Schema** (dashboard.py:summary response): add field to return dict
3. **Frontend** (Dashboard.tsx): display new breakdown, add filter controls if needed

## Add validation rule

1. **Schema** (schemas.py): use Pydantic `@field_validator` (before/after mode) or Field(...) constraints
2. **Router**: extract, validate business logic (e.g. loan direction matches tx kind), raise HTTPException(400, msg)
3. **Tests**: add test case that triggers validation, verify 400 response + error message

## Add new import parsing preset

1. **Router** (imports.py:apply_mapping): detect bank via header signature in detect_preset()
2. **Model** (ColumnPreset): add preset row with header_signature + mapping
3. **Tests**: test CSV with that bank's headers auto-applies preset
