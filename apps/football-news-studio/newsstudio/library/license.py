"""Lizenz-Gate: entscheidet für jede Datei, ob sie verwendet werden darf – im Zweifel NEIN."""

from __future__ import annotations

import datetime as dt

from .. import db
from ..config import Settings

USABLE = {"freigegeben", "läuft_bald_ab"}
STATUS_LABEL = {
    "freigegeben": "Freigegeben",
    "läuft_bald_ab": "Läuft bald ab",
    "abgelaufen": "Abgelaufen",
    "unklar": "Lizenz unklar",
    "nicht_erlaubt": "Nicht erlaubt",
    "gesperrt": "Gesperrt",
}


def effective(media: dict, profile: dict | None) -> dict:
    """Zusammengeführte Lizenzangaben: Datei-Overrides schlagen das Profil."""
    p = profile or {}
    platforms = media.get("lic_platforms") if media.get("lic_platforms") not in (None, "") else p.get("platforms", "")
    commercial = media.get("lic_commercial") if media.get("lic_commercial") is not None else p.get("commercial")
    valid_until = media.get("lic_valid_until") or p.get("valid_until")
    credit = media.get("lic_credit") or render_credit(p.get("credit_template", ""), media)
    return {
        "platforms": [x.strip().lower() for x in (platforms or "").split(",") if x.strip()],
        "commercial": commercial,
        "valid_until": valid_until,
        "unlimited": bool(p.get("unlimited")) and not media.get("lic_valid_until"),
        "credit": credit,
        "confirmed": bool(p.get("confirmed")),
        "profile": p.get("name"),
    }


def render_credit(template: str, media: dict) -> str:
    if not template:
        return ""
    byline = (media.get("byline") or "").strip()
    out = template.replace("{byline}", byline).replace("{credit}", (media.get("credit") or "").strip())
    out = out.replace("{source}", media.get("source") or "")
    return " ".join(out.replace("  ", " ").split()).strip(" /")


def check(media: dict, profile: dict | None, settings: Settings | None = None, today: dt.date | None = None) -> dict:
    s = settings or Settings.load()
    today = today or dt.date.today()
    reasons: list[str] = []
    if media.get("blocked"):
        return {"status": "gesperrt", "usable": False, "reasons": ["manuell gesperrt"], "license": effective(media, profile)}
    if not profile:
        return {"status": "unklar", "usable": False, "reasons": ["keine Lizenz zugeordnet"], "license": effective(media, None)}
    lic = effective(media, profile)
    status = "freigegeben"
    if not lic["confirmed"]:
        reasons.append("Lizenzprofil nicht bestätigt")
        status = "unklar"
    if not lic["platforms"]:
        reasons.append("erlaubte Plattformen fehlen")
        status = "unklar"
    elif s.platform.lower() not in lic["platforms"] and "alle" not in lic["platforms"]:
        reasons.append(f"{s.platform} ist nicht erlaubt")
        status = "nicht_erlaubt"
    if lic["commercial"] is None:
        reasons.append("kommerzielle Nutzung ungeklärt")
        status = "unklar" if status == "freigegeben" else status
    elif not lic["commercial"]:
        reasons.append("kommerzielle Nutzung nicht erlaubt")
        status = "nicht_erlaubt"
    if not lic["valid_until"] and not lic["unlimited"]:
        reasons.append("Ablaufdatum fehlt")
        status = "unklar" if status == "freigegeben" else status
    elif lic["valid_until"]:
        try:
            until = dt.date.fromisoformat(lic["valid_until"][:10])
        except ValueError:
            reasons.append("Ablaufdatum ungültig")
            status = "unklar"
        else:
            if until < today:
                reasons.append(f"Lizenz am {until.isoformat()} abgelaufen")
                status = "abgelaufen"
            elif status == "freigegeben" and (until - today).days <= s.license_warn_days:
                reasons.append(f"läuft am {until.isoformat()} ab")
                status = "läuft_bald_ab"
    if not lic["credit"]:
        reasons.append("Bildnachweis fehlt")
        status = "unklar" if status in USABLE else status
    return {"status": status, "usable": status in USABLE, "reasons": reasons, "license": lic}


def profile(pid: int | None) -> dict | None:
    if not pid:
        return None
    return db.one("SELECT * FROM license_profile WHERE id=?", (pid,))


def check_media(media_id: int, settings: Settings | None = None) -> dict:
    m = db.one("SELECT * FROM media WHERE id=?", (media_id,))
    if not m:
        return {"status": "unklar", "usable": False, "reasons": ["Datei unbekannt"], "license": {}}
    return check(m, profile(m.get("license_profile_id")), settings)


PROFILE_FIELDS = ("name", "source", "reference", "platforms", "commercial", "valid_until", "unlimited",
                  "credit_template", "restrictions", "confirmed")


def save_profile(data: dict, pid: int | None = None) -> int:
    vals = {k: data.get(k) for k in PROFILE_FIELDS if k in data}
    if "platforms" in vals and isinstance(vals["platforms"], list):
        vals["platforms"] = ",".join(vals["platforms"])
    if pid:
        sets = ", ".join(f"{k}=?" for k in vals)
        db.execute(f"UPDATE license_profile SET {sets} WHERE id=?", (*vals.values(), pid))
        return pid
    cols = ", ".join(vals)
    return db.execute(f"INSERT INTO license_profile({cols}) VALUES({', '.join('?' for _ in vals)})", tuple(vals.values()))


def ensure_default_profiles() -> None:
    """Legt je Quelle ein (unbestätigtes!) Profil an. Ohne Bestätigung bleibt alles gesperrt."""
    if db.one("SELECT id FROM license_profile LIMIT 1"):
        return
    for name, source, credit in (
        ("MAXPPP – Vertrag", "MAXPPP", "Foto: {byline} / MAXPPP"),
        ("PressBox – Stats Perform", "PressBox", "Video: PressBox / Stats Perform"),
        ("Eigene Medien", "Eigene", "{credit}"),
    ):
        save_profile({"name": name, "source": source, "credit_template": credit, "confirmed": 0, "platforms": ""})
