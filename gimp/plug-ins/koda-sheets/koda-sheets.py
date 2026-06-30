#!/usr/bin/env python3
"""Koda Sheets - card-sheet imposition plug-in for GIMP 3.0.

Tiles individual card images from a folder onto print-ready sheets, pairs
fronts with backs by filename, and lays out duplex (double-sided) sheets that
mirror correctly for flip alignment. This is the GIMP port of the Photoshop
script KodaSheets.jsx.

Install: copy this whole folder (koda-sheets/) into your GIMP user plug-ins
directory, e.g. on Windows:
    %APPDATA%\\GIMP\\3.0\\plug-ins\\koda-sheets\\
On Linux/macOS:
    ~/.config/GIMP/3.0/plug-ins/koda-sheets/
Ensure koda-sheets.py is executable, then restart GIMP. The command appears at
Filters > Koda Sheets...
"""

import os
import sys

import gi

gi.require_version("Gimp", "3.0")
gi.require_version("GimpUi", "3.0")
from gi.repository import Gimp, GimpUi, GLib  # noqa: E402

# The plug-in's own directory is on sys.path, so the package imports resolve.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from kodasheets.settings import load_settings, save_settings  # noqa: E402
from kodasheets.dialog import show_dialog  # noqa: E402
from kodasheets.render import generate_sheets, _Log  # noqa: E402
from kodasheets.scan import scan_folder  # noqa: E402

PROC_NAME = "python-fu-koda-sheets"


def _write_log(log):
    """Best-effort log file next to the settings, for troubleshooting."""
    try:
        path = os.path.join(Gimp.directory(), "koda-sheets-log.txt")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("=== Koda Sheets log ===\n" + log.text() + "\n")
        return path
    except Exception:
        return ""


class KodaSheets(Gimp.PlugIn):
    def do_query_procedures(self):
        return [PROC_NAME]

    def do_set_i18n(self, _name):
        return False

    def do_create_procedure(self, name):
        # An ImageProcedure is what lets the command live in the <Image> menus
        # (Filters). It ignores the passed-in image - Koda Sheets always builds
        # its own new document - but GIMP requires an image to be open for the
        # menu item to be enabled.
        procedure = Gimp.ImageProcedure.new(self, name, Gimp.PDBProcType.PLUGIN,
                                            self.run, None)
        procedure.set_menu_label("Koda Sheets...")
        procedure.add_menu_path("<Image>/Filters")
        procedure.set_documentation(
            "Tile card images onto print-ready sheets (imposition).",
            "Pairs fronts with backs by filename and lays out duplex sheets "
            "that mirror for flip alignment. Card-sheet imposition for tabletop "
            "card printing.",
            name)
        procedure.set_attribution("Kodaijin", "Kodaijin", "2026")
        return procedure

    def run(self, procedure, _run_mode, _image, _drawables, _config, _run_data):
        GimpUi.init("koda-sheets")

        s = load_settings()
        action, s = show_dialog(s)
        if action != "generate":
            return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, GLib.Error())

        save_settings(s)

        log = _Log()
        try:
            shared = s["shared_back"] or None
            scan = scan_folder(s["folder"], shared)
            if scan["total"] == 0:
                raise ValueError("No front images found in the chosen folder.")

            gr = generate_sheets(s, scan, log)

            missing = sum(1 for f in scan["fronts"] if not f["has_own_back"])
            log_path = _write_log(log)
            Gimp.message(
                "Koda Sheets done.\n\n"
                "Cards: %d\nPer sheet: %d (%d x %d)\n"
                "Sheets: %d%s\n"
                "Fronts without own back: %d%s"
                % (gr["total"], gr["per_sheet"], gr["layout"]["cols"],
                   gr["layout"]["rows"], gr["sheets"],
                   (" front + %d back" % gr["sheets"]) if s["duplex"] else " (front only)",
                   missing,
                   ("\n\nLog: " + log_path) if log_path else ""))
        except Exception as e:  # noqa: BLE001 - surface to the user
            log("ERROR: " + str(e))
            log_path = _write_log(log)
            Gimp.message("Koda Sheets error:\n%s%s"
                         % (str(e), ("\n\nLog: " + log_path) if log_path else ""))
            return procedure.new_return_values(
                Gimp.PDBStatusType.EXECUTION_ERROR,
                GLib.Error(str(e)))

        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())


Gimp.main(KodaSheets.__gtype__, sys.argv)
