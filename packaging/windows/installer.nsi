; Music Player NSIS Installer Script
; ---------------------------------

; Include Modern UI
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

; General settings
Name "Music Player"
OutFile "MusicPlayer_Setup.exe"
InstallDir "$PROGRAMFILES64\MusicPlayer"
InstallDirRegKey HKCU "Software\MusicPlayer" "Install_Dir"
RequestExecutionLevel admin

; Version information
!define VERSION "1.0.0"
VIProductVersion "1.0.0.0"
VIAddVersionKey /LANG=1033 "ProductName" "Music Player"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "(C) 2025 Music Player Team"

; Interface settings
!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Languages
!insertmacro MUI_LANGUAGE "English"

; Installer sections
Section "Main Application" SecMain
  SectionIn RO
  
  ; Set output path to the installation directory
  SetOutPath "$INSTDIR"
  
  ; Add files
  File /r "..\..\target\release\*.exe"
  File /r "..\..\target\release\*.dll"
  
  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"
  
  ; Add/Remove Programs entry
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MusicPlayer" \
                 "DisplayName" "Music Player"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MusicPlayer" \
                 "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MusicPlayer" \
                 "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MusicPlayer" \
                 "Publisher" "Music Player Team"
  
  ; Create start menu shortcuts
  CreateDirectory "$SMPROGRAMS\Music Player"
  CreateShortCut "$SMPROGRAMS\Music Player\Music Player.lnk" "$INSTDIR\music_player.exe"
  CreateShortCut "$SMPROGRAMS\Music Player\Uninstall.lnk" "$INSTDIR\uninstall.exe"
  
  ; Create desktop shortcut
  CreateShortCut "$DESKTOP\Music Player.lnk" "$INSTDIR\music_player.exe"
  
  ; File associations
  WriteRegStr HKCR ".mp3" "" "MusicPlayer.AssocFile.MP3"
  WriteRegStr HKCR "MusicPlayer.AssocFile.MP3" "" "MP3 Audio File"
  WriteRegStr HKCR "MusicPlayer.AssocFile.MP3\DefaultIcon" "" "$INSTDIR\music_player.exe,0"
  WriteRegStr HKCR "MusicPlayer.AssocFile.MP3\shell\open\command" "" '"$INSTDIR\music_player.exe" "%1"'
  
  ; Refresh shell
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
SectionEnd

; Uninstaller section
Section "Uninstall"
  ; Remove files and directories
  RMDir /r "$INSTDIR"
  
  ; Remove start menu shortcuts
  Delete "$SMPROGRAMS\Music Player\Music Player.lnk"
  Delete "$SMPROGRAMS\Music Player\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Music Player"
  
  ; Remove desktop shortcut
  Delete "$DESKTOP\Music Player.lnk"
  
  ; Remove registry keys
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MusicPlayer"
  
  ; Remove file associations
  DeleteRegKey HKCR "MusicPlayer.AssocFile.MP3"
  
  ; Refresh shell
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
SectionEnd
