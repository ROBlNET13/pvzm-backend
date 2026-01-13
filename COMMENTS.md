# Comments

Comments should be in (mostly) lowercase. They should be used to explain the purpose of a section of code, not to describe what the code is doing.

Here's a set of VSCode RegEx patterns to fix comment case. Keep in mind that these patterns are not perfect and may require you to exclude certain files manually (deno.lock comes to mind)

1. Make comment lowercase:

   - Find: `([^\S\r\n]+)//([^\S\r\n]*)([A-Z])`
   - Replace: `$1//$2\l$3`

2. Fix inconsistencies (the above RegEx would change "DOM" to "dOM", this fixes that):
   - Find: `([^\S\r\n]+)//([^\S\r\n]*)([a-z])([A-Z])`
   - Replace: `$1//$2\u$3$4`
