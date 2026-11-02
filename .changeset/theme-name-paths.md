---
"@cogenta/cli": patch
"@cogenta/api": patch
---

The theme sandbox, deploy, restore, version and delete routes now refuse a sandbox id, theme name or version that is not a plain directory name (`THEME_SANDBOX_PATH_ESCAPE`, 400). A body field such as `{"themeName": "../x"}` could previously make an admin request create, overwrite or delete a directory outside `themes/`.
