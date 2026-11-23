# Der Wächter: Prüfung vor der Veröffentlichung

Nach `/einrichten` steht dein echtes Angebot, deine Zielgruppe und deine Kontaktdaten im Klon. Das ist gewollt. Es darf aber nicht aus Versehen öffentlich werden: bei einem Fork, einem Push in ein öffentliches Repo oder einer Kopie des Arbeitsstands.

`scripts/check-generic.mjs` prüft das, bevor es passiert.

```bash
node scripts/check-generic.mjs            # Arbeitsstand (auch ungespeicherte und neue Dateien)
node scripts/check-generic.mjs --history  # zusätzlich jeder Commit der Historie
node scripts/check-generic.test.mjs       # Test des Wächters selbst
```

Exit 0 heißt sauber, Exit 1 heißt Funde. Bei Funden: Wert durch einen Platzhalter ersetzen oder in eine Konfiguration außerhalb des Repos legen.

## Was er sucht

Nur Muster, keine Namen:

| Muster | Warum |
|---|---|
| echte E-Mail-Adresse | eine Adresse, die wirklich erreichbar ist, gehört nicht ins Repo |
| schlüsselförmige Zeichenfolge | Zugangsdaten liegen in `.env` oder `.mcp.json`, nie im Baum |
| absoluter Heimatpfad | verrät einen Benutzernamen und funktioniert bei anderen nicht |
| nackte UUID | Datenbank-, Workspace- und Dokument-IDs benennen ein Live-System |
| fest eingetragene Live-Domain | Platzhalter wie `example.com` oder `YOUR_*` verwenden |

Er trägt bewusst **keine Liste mit Firmen- oder Kundennamen**. Eine Liste der Namen, die man schützen will, würde sie im Akt des Schützens veröffentlichen. Prüfe Namen mit einer privaten Liste außerhalb dieses Repos.

## Die eine dokumentierte Ausnahme

Der Link auf die Produktdokumentation der Maintainer (`https://www.cegtec.net/gtm-goat/docs/`) steht im optionalen Abschnitt "Connect to GTM Goat" der READMEs und in `docs/werkzeuge.md` und `vorlagen/README.md`. Er ist **nur als genau diese URL und nur in diesen vier Dateien** erlaubt. Jede andere Live-Domain und diese Domain an anderer Stelle schlagen weiter an. Der Test deckt das ab.

Mit `--history` meldet der Wächter einen akzeptierten Treffer aus dem allerersten Commit (eine Verlinkung auf die Maintainer im alten README). Die Historie wird nicht umgeschrieben; der Treffer ist in `ACCEPTED_COMMITS` eingetragen und wird beim Lauf ausgewiesen, nicht verschwiegen.

## Grenzen

- Der Wächter findet Muster, keine Bedeutung. Ein Kundenname in Fließtext fällt nicht auf.
- Er läuft von Hand. In einer CI-Pipeline läuft er noch nicht.
- Er ersetzt nicht den Blick in `firma/`, `ergebnisse/`, `ops/` und `docs/lernen/` vor dem Veröffentlichen. Am sichersten bleibt: Dein Arbeitsstand liegt in einem **privaten** Repo.
