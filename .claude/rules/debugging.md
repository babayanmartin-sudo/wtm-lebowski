# Debugging Tips

- **Currency conversion issues**: check `to_base()` rate lookup date; test assumes default 1.0 unless explicitly set
- **Categorization not learning**: check matcher.py suggest() — fuzzy matches only non-archived transactions; rules must exist
- **Import row not suggesting category**: check duplicate detection (is_duplicate flag), rule priority ordering, then fuzzy fallback
- **Loan remaining shows wrong**: verify transaction kind matches loan direction (expense for debt, income for receivable)
- **Dashboard category filter shows nothing**: check wanted list construction — parent must be included if children exist
