"""scan.py - Folder scan, front/back pairing, natural sort.

Pure logic; no GIMP dependency. Ported from KodaSheets.jsx lines 196-304.
Works on filesystem paths so it can be unit-tested with plain python3.
"""

import functools
import os
import re

_IMAGE_RE = re.compile(r"\.(png|jpg|jpeg)$", re.IGNORECASE)
_BACK_RE = re.compile(r"[ _\-]back$", re.IGNORECASE)
_CHUNK_RE = re.compile(r"\d+|\D+")


def file_base_name(name):
    """Filename without its extension (matches JSX fileBaseName)."""
    dot = name.rfind(".")
    return name[:dot] if dot > 0 else name


def is_back_base(base):
    return bool(_BACK_RE.search(base))


def front_key_of_back(base):
    return _BACK_RE.sub("", base)


def _chunkify(s):
    return _CHUNK_RE.findall(s)


def natural_compare(a, b):
    """Natural (numeric-aware) string comparison; returns -1/0/1."""
    ax = _chunkify(a.lower())
    bx = _chunkify(b.lower())
    for i in range(min(len(ax), len(bx))):
        as_, bs = ax[i], bx[i]
        a_num = as_[:1].isdigit()
        b_num = bs[:1].isdigit()
        if a_num and b_num:
            an, bn = float(as_), float(bs)
            if an != bn:
                return -1 if an < bn else 1
        else:
            if as_ < bs:
                return -1
            if as_ > bs:
                return 1
    return (len(ax) > len(bx)) - (len(ax) < len(bx))


def scan_folder(folder, shared_back_file=None):
    """Scan a folder and pair fronts with backs.

    folder: path to the image folder.
    shared_back_file: fallback back-image path used when a front has no own back.

    Returns dict: fronts [{file, base, back (path|None), has_own_back}],
    backs_unmatched [base...], total.
    """
    try:
        names = os.listdir(folder)
    except OSError:
        names = []
    names = [n for n in names
             if _IMAGE_RE.search(n) and os.path.isfile(os.path.join(folder, n))]

    fronts = []
    backs = {}        # lowercased front key -> path
    back_bases = []   # for unmatched reporting

    for n in names:
        path = os.path.join(folder, n)
        base = file_base_name(n)
        if is_back_base(base):
            key = front_key_of_back(base).lower()
            backs[key] = path
            back_bases.append(base)
        else:
            fronts.append({"file": path, "base": base})

    fronts.sort(key=functools.cmp_to_key(
        lambda a, b: natural_compare(a["base"], b["base"])))

    matched_keys = {}
    for front in fronts:
        fk = front["base"].lower()
        if fk in backs:
            front["back"] = backs[fk]
            front["has_own_back"] = True
            matched_keys[fk] = True
        else:
            front["back"] = shared_back_file if shared_back_file else None
            front["has_own_back"] = False

    unmatched = []
    for bb in back_bases:
        bkey = front_key_of_back(bb).lower()
        if bkey not in matched_keys:
            unmatched.append(bb)

    return {"fronts": fronts, "backs_unmatched": unmatched, "total": len(fronts)}


def scan_summary(scan, shared_back_file=None):
    """Human-readable summary of a scan (matches JSX scanSummaryText)."""
    lines = ["Fronts found: %d" % scan["total"]]
    with_back = 0
    missing = []
    for front in scan["fronts"]:
        if front["has_own_back"]:
            with_back += 1
        else:
            missing.append(front["base"])
    lines.append("Fronts with their own back file: %d" % with_back)
    if missing:
        tail = " (will use shared back)" if shared_back_file else " (will be blank white)"
    else:
        tail = ""
    lines.append("Fronts WITHOUT a back: %d%s" % (len(missing), tail))
    if missing:
        more = " ..." if len(missing) > 12 else ""
        lines.append("  " + ", ".join(missing[:12]) + more)
    if scan["backs_unmatched"]:
        lines.append("Back files with no matching front: %d" % len(scan["backs_unmatched"]))
        more = " ..." if len(scan["backs_unmatched"]) > 12 else ""
        lines.append("  " + ", ".join(scan["backs_unmatched"][:12]) + more)
    return "\n".join(lines)
