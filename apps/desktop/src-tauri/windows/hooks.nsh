; PokePet installer hooks (see bundle.windows.nsis.installerHooks in tauri.conf.json).
;
; After installing, leave the app a note with where this installer was run from. Browsers
; attach a "Zone.Identifier" stream to downloaded files that records the page the download
; came from (e.g. /pet/bulbasaur). On first launch the app reads that stream from the
; installer and adopts the pet the visitor picked, so they don't have to pick it again.

!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$APPDATA\app.pokepet.desktop"
  FileOpen $0 "$APPDATA\app.pokepet.desktop\installer-path.txt" w
  FileWrite $0 "$EXEPATH"
  FileClose $0
!macroend
