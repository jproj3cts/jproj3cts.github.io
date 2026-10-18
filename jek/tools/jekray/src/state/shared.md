# Shared mutable state

None: every binding a module takes from another is imported, and a module assigns another's only through its exported setter (`setProject`, `setDrag`, …).
