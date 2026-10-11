# CYD Atelier

Nach dem Start **Weboberfläche öffnen** wählen. Entitäten deiner Instanz werden
automatisch geladen. Unter **Entität** oder **Entitätenliste** auswählen; Änderungen
der Zustände werden live in der Vorschau angezeigt.

Ein bestehendes Design unter **Designs → Projektdatei öffnen** laden. Projektdateien
zum Sichern herunterladen: Designs bleiben im jeweiligen Browser gespeichert.

Layoutänderungen durch **YAML exportieren**, in ESPHome validieren und installieren
auf das CYD übertragen. Für Bens 3,5″-Display das ST7796-Profil mit GPIO27 verwenden.

Bei getrenntem Home Assistant zeigt die Vorschau letzte Werte und verbindet sich
automatisch erneut. Es wird kein manuelles Zugriffstoken benötigt.

Diese Version wurde mit einem simulierten Home Assistant geprüft; der erste Start
auf deinem realen System ist noch zu testen.

## Entitätenliste sortieren

Unter **Entitäten & Reihenfolge** am Griff rechts ziehen: Die Zeile wird angehoben,
und die anderen Zeilen machen Platz. Das funktioniert mit Maus und Touch.
Am oberen oder unteren Rand scrollt die Liste automatisch weiter. Erst beim
Loslassen wird die neue Reihenfolge gespeichert. **Escape** bricht das Ziehen ab;
**Rückgängig** setzt einen abgeschlossenen Sortiervorgang zurück.

Alternativ die Pfeile neben der Zeile verwenden oder den Ziehgriff mit Tab
fokussieren und mit **Pfeil hoch/runter**, **Pos1** oder **Ende** sortieren.
Die größeren Schriftgrößen der Einstellungen ändern die Display-Schriften nicht.

## Lokale Quellen übernehmen

Änderungen unter `/config/cyd_atelier` müssen in den tatsächlichen Add-on-Ordner
`/addons/cyd_atelier` übernommen werden. Anschließend den Add-on-Store aktualisieren
und Version **1.1.1** neu bauen/aktualisieren. Die Dateien in `/config` allein ändern
das bereits installierte Add-on nicht. Designs bleiben im Browser gespeichert;
eine Projektdatei dient als zusätzliche Sicherung.

## Neue Widgets

Unter **Weitere Widgets** stehen Statuskachel, Balkenanzeige, Ringanzeige, Uhr/Datum,
Dauer/Timer und Touch-Taste bereit. Danach rechts die Datenquelle wählen.
Balken und Ringe stellen einen numerischen Messwert zwischen einstellbarem Minimum
und Maximum dar. Fehlende oder nichtnumerische Werte ergeben keine Füllung.
**Dauer / Timer** zeigt die Sekunden eines Sensors oder numerischen Attributs als
Minuten/Sekunden oder Stunden/Minuten/Sekunden. Für einen laufenden Bezug oder einen
Countdown muss die gewählte Entität laufend die tatsächlichen Sekunden liefern.
Die Anzeige startet keinen eigenen Countdown.

Die Uhr verwendet im Browser die gewählte Zeitzone und im ESPHome-Export die von
Home Assistant synchronisierte Zeit. Unter **Seiten verwalten** die Zeitzone prüfen
(Standard: `Europe/Berlin`). Uhrzeit, Datum, Sekunden und Wochentag sind auswählbar.

Unter **Zustandsfarben & Icons** bis zu acht Regeln einrichten. Die erste passende
Regel kann Wert-/Iconfarbe, Hintergrund oder Icon ersetzen. Verglichen wird der
ursprüngliche Zustand bzw. das gewählte Attribut, z. B. `on`, `off`, `unavailable`
oder eine Zahl ohne Einheit. Optionale Farben als `#RRGGBB` eingeben.

## Ausrichten und gestalten

**Mehrfachauswahl** einschalten und Widgets antippen; am Desktop alternativ mit
Umschalt klicken. Die Auswahl lässt sich gemeinsam verschieben, ausrichten, auf
identische Größen bringen und mit gleichmäßigen Abständen verteilen. Ein einzelnes
Widget wird am Display ausgerichtet, eine Gruppe am gemeinsamen Rahmen.
Hilfslinien helfen beim Einrasten an Rändern, Mitte und Nachbarwidgets; beim Ziehen
mit Alt sind sie vorübergehend aus. Gesperrte Widgets bleiben an ihrer Position.
Mit **Stil kopieren / Stil anwenden** Schrift, Farben, Rahmen und Ausrichtung auf
andere Widgets übertragen, ohne Datenquelle, Text oder Geometrie auszutauschen.

Namen und Werte können getrennt links/mittig/rechts stehen. Inhalt lässt sich oben,
mittig oder unten anordnen. Entitätenlisten bieten schlichte Zeilen, Trennlinien
oder wechselnde Zeilenfarben sowie vertikale Ausrichtung innerhalb jeder Zeile.

## Displayseiten und Ausrichtungen

Unter **Seiten verwalten** bis zu acht Seiten anlegen und benennen. Die Tabs wechseln
im Editor die bearbeitete Seite. Für das Gerät einen automatischen Wechsel von
5 bis 600 Sekunden einstellen (0 = aus) und **Nächste Seite** oder **Zufällig** wählen.
Der Zufallsmodus wählt immer eine andere Seite. Bei nur einer Seite bleibt die
Anzeige stehen. Die Vorschau wechselt nicht automatisch, damit sich das Layout
in Ruhe bearbeiten lässt.

Die optionale **Punktleiste** zeigt unten Punkte im iOS-Stil: Die aktuelle Seite
hat einen größeren Punkt, die übrigen eine andere Farbe. Beide Farben lassen sich
festlegen. Die globale Einstellung gilt für alle Seiten; jede Seite kann sie
übernehmen oder die Leiste ausdrücklich anzeigen bzw. ausblenden. Auf Seiten mit
sichtbarer Leiste die unteren 28 Pixel freilassen. Im Editor wechseln die Punkte
zur entsprechenden Seite.

Touch-Navigation unabhängig von der Punktleiste einschalten: Nach links wischen
wechselt zur nächsten Seite, nach rechts zur vorherigen. Das funktioniert auch
bei ausgeblendeter Leiste. Mit deaktivierter Touch-Navigation bleibt eine sichtbare
Leiste auf dem Gerät eine reine Seitenanzeige. Navigation und automatische Wechsel
werden nach dem ESPHome-Export und der Installation auf dem CYD wirksam.

Für jede Seite werden Hoch- und Querformat getrennt gespeichert. Beim ersten Wechsel
wird das Layout passend skaliert; spätere Wechsel stellen die gespeicherte Geometrie
wieder her. Der YAML-Export verwendet die aktuell gewählte Geräteausrichtung.
Projektdateien und benannte Designs enthalten alle Seiten und beide Layouts.

## Touch-Tasten auf dem Gerät

Touch-Tasten konfigurieren eine unterstützte Aktion wie Licht/Schalter umschalten,
Szene aktivieren oder Skript starten und eine passende Zielentität. Die Vorschau
führt keine Aktionen aus. Nach dem Export muss ein passender Touchscreen vorhanden
sein: unter **Helligkeit & Ein/Aus** dessen ID wählen. Für das 3,5″-ST7796-Profil kann
der Generator den vorhandenen festen Touch-Aufbau ergänzen.

In Home Assistant bei der ESPHome-Integration des CYD **Ausführen von
Home-Assistant-Aktionen erlauben** aktivieren. Es werden keine zusätzlichen
Zugangsdaten benötigt. Änderungen unter `/config/cyd_atelier` aktualisieren weder
das installierte Add-on noch die Firmware automatisch; Add-on neu bauen und
exportiertes YAML zuerst in ESPHome validieren, dann auf das CYD übertragen.
