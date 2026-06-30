"""settings.py - Best-effort settings persistence for the GIMP plug-in.

Replaces the Photoshop app.putCustomOptions/getCustomOptions approach
(KodaSheets.jsx 327-398) with a JSON file under the user's GIMP directory, so
dialog values are remembered between runs.

Importing this module pulls in Gimp only to locate the config directory; the
load/save themselves degrade to no-ops if anything goes wrong.
"""

import json
import os

from .presets import default_settings

_FILENAME = "koda-sheets-settings.json"


def _config_path():
    """Path to the settings JSON inside the GIMP user directory.

    Falls back to the OS temp dir if Gimp is unavailable (e.g. during tests).
    """
    try:
        import gi
        gi.require_version("Gimp", "3.0")
        from gi.repository import Gimp
        return os.path.join(Gimp.directory(), _FILENAME)
    except Exception:
        import tempfile
        return os.path.join(tempfile.gettempdir(), _FILENAME)


def load_settings():
    """Return saved settings merged over the defaults. Never raises."""
    s = default_settings()
    try:
        with open(_config_path(), "r", encoding="utf-8") as fh:
            saved = json.load(fh)
        if isinstance(saved, dict):
            for key in s:
                if key in saved:
                    s[key] = saved[key]
    except Exception:
        pass  # no saved settings yet, or unreadable - use defaults
    return s


def save_settings(s):
    """Persist settings as JSON. Best-effort; never raises."""
    try:
        with open(_config_path(), "w", encoding="utf-8") as fh:
            json.dump(s, fh, indent=2)
    except Exception:
        pass
