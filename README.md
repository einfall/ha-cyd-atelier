# CYD Atelier

Home-Assistant-Add-on zum Gestalten von CYD-Displays und zum Export vollständiger ESPHome-Konfigurationen. Aktuelle Version: **1.1.1**.

## Installation

Dieses Repository im Home-Assistant-Add-on-Store hinzufügen:

`https://github.com/einfall/ha-cyd-atelier`

Danach **CYD Atelier** installieren, starten und die Weboberfläche öffnen.

## Funktionen

- Automatische Home-Assistant-Entitäten und Live-Vorschau.
- Entitätenlisten mit Drag & Drop, größere Einstellungen und Speichern ohne `crypto.randomUUID`.
- Status-, Balken-, Ring-, Uhr-, Dauer- und Touch-Widgets.
- Mehrfachauswahl, Ausrichten, Hilfslinien, Positionssperren und Stilübertragung.
- Mehrere Seiten mit eigenen Hoch-/Querformatlayouts.
- Zeitgesteuerter Seitenwechsel: nächste oder zufällige andere Seite.
- Optionale iOS-Punktleiste global oder pro Seite, eigene Farben und Wischen nach links/rechts.

Layoutänderungen durch YAML-Export, Validierung und Installation in ESPHome auf das CYD übertragen. Die Editor-Vorschau löst keine Geräteaktionen aus.

[Anleitung](cyd_atelier/DOCS.md) · [Änderungen](cyd_atelier/CHANGELOG.md)

Browser-/Touchtests und ESPHome-Konfiguration/Codegenerierung wurden geprüft. Ein vollständiger Firmware-Build und Tests auf einem echten CYD/iPhone stehen noch aus.

## Entwickeln

Frontend-Abhängigkeiten stehen in `cyd_atelier/frontend/package.json` und sind fest versioniert. Im Frontend-Verzeichnis installieren und bauen:

```sh
npm install
node build.mjs
```

Quellen, Prüfungen und fertige Frontend-Dateien sind im Repository enthalten. Die Lizenzen der eingebundenen Schriften und Icons liegen unter `cyd_atelier/frontend/dist/assets`.
