-- Standalone AppleScript: create a recruitment candidate note
-- Usage: osascript createNote.scpt "Full Name" "Body text"
on run argv
	set candidateName to item 1 of argv
	set noteBody to item 2 of argv
	set folderName to "Recruitment"

	tell application "Notes"
		activate
		if not (exists folder folderName) then
			make new folder with properties {name:folderName}
		end if
		set targetFolder to folder folderName
		make new note at targetFolder with properties {name:candidateName, body:noteBody}
	end tell

	return "Note created: " & candidateName
end run
