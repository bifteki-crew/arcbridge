# ArcBridge demo — `arcbridge adopt` on an existing codebase.
# Recorded from a checkout of the example app
# (github.com/bifteki-crew/arcbridge-example-bookmarks) with `arcbridge` on PATH.
# To regenerate:
#   git clone https://github.com/bifteki-crew/arcbridge-example-bookmarks
#   cd arcbridge-example-bookmarks
#   vhs /path/to/arcbridge/docs/demo/adopt.tape   # writes adopt.gif in cwd
#   mv adopt.gif /path/to/arcbridge/docs/demo/adopt.gif
Require arcbridge

Output adopt.gif
Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 800
Set Padding 24
Set Theme "Catppuccin Mocha"

Hide
Type "export PS1='$ '" Enter
Type "clear" Enter
Sleep 1s
Show

Type "# A Next.js bookmark app — no architecture model yet." Sleep 600ms Enter
Sleep 800ms
Type "arcbridge adopt --apply" Sleep 400ms Enter
Sleep 5s
Type "# Every indexed file is mapped to a block. Now enforce it:" Sleep 600ms Enter
Sleep 800ms
Type "arcbridge drift --reindex" Sleep 400ms Enter
Sleep 3.5s
