# Der Wächter: Prüfung vor der Veröffentlichung

Nach `/einrichten` steht dein echtes Angebot, deine Zielgruppe und deine Kontaktdaten im Klon. Das ist gewollt. Es darf aber nicht aus Versehen öffentlich werden: bei einem Fork, einem Push in ein öffentliches Repo oder einer Kopie des Arbeitsstands.

`scripts/check-generic.mjs` prüft das, bevor es passiert.

```bash
node scripts/check-generic.mjs            # Arbeitsstand (auch ungespeicherte und neue Dateien)
node scripts/check-generic.mjs --history  # zusätzlich jeder Commit der Historie
node scripts/check-generic.test.mjs       # Test des Wächters selbst
```

Exit 0 heißt sauber, Exit 1 heißt Funde, Exit 2 heißt: Dateien waren nicht lesbar, das Ergebnis ist **nicht** sauber (der Wächter nennt sie). Bei Funden: Wert durch einen Platzhalter ersetzen oder in eine Konfiguration außerhalb des Repos legen.

## Was er sucht

Nur Muster, keine Namen:

| Muster | Warum |
|---|---|
| echte E-Mail-Adresse | eine Adresse, die wirklich erreichbar ist, gehört nicht ins Repo |
| schlüsselförmige Zeichenfolge | Zugangsdaten liegen in `.env` oder `.mcp.json`, nie im Baum |
| absoluter Heimatpfad | verrät einen Benutzernamen und funktioniert bei anderen nicht |
| nackte UUID | Datenbank-, Workspace- und Dokument-IDs benennen ein Live-System |
| fest eingetragene Live-Domain (nur `http(s)://`-Links) | Platzhalter wie `example.com` oder `YOUR_*` verwenden |

Er trägt bewusst **keine Liste mit Firmen- oder Kundennamen**. Eine Liste der Namen, die man schützen will, würde sie im Akt des Schützens veröffentlichen. Prüfe Namen mit einer privaten Liste außerhalb dieses Repos.

## Die eine dokumentierte Ausnahme

Der Link auf die Produktdokumentation der Maintainer (`https://www.cegtec.net/gtm-goat/docs/`) steht im optionalen Abschnitt "Connect to GTM Goat" der READMEs, in `docs/werkzeuge.md`, `docs/waechter.md` und `vorlagen/README.md`. Er ist **nur als URL mit genau diesem Anfang und nur in diesen fünf Dateien** erlaubt. Jede andere Live-Domain und diese Domain an anderer Stelle schlagen weiter an. Der Test deckt das ab.

Mit `--history` meldet der Wächter genau einen akzeptierten Treffer aus dem allerersten Commit (eine Verlinkung auf die Maintainer im alten README). Die Historie wird nicht umgeschrieben. Akzeptiert ist nur dieses eine Tupel aus Commit, Regel, Datei und Fundstelle (`ACCEPTED_HISTORY`); alles andere in diesem Commit wird wie jeder Fund gemeldet. Der akzeptierte Treffer wird beim Lauf ausgewiesen, nicht verschwiegen.

## Grenzen

- Der Wächter findet Muster, keine Bedeutung. Ein Kundenname in Fließtext fällt nicht auf.
- Jeder Treffer einer Zeile wird einzeln beurteilt. Erlaubte Hosts gelten nur, wenn der Host genau so heißt oder eine Subdomain davon ist (`docs.github.com` ja, `notgithub.com` und `github.com.firma.de` nein).
- Die Domain-Regel kennt nur `http(s)://`-Links. Nackte Domains (`www.firma.de`) und `git@host:`-Adressen erkennt sie nicht.
- Er läuft von Hand. In einer CI-Pipeline läuft er noch nicht.
- Er ersetzt nicht den Blick in `firma/`, `ergebnisse/`, `ops/` und `docs/lernen/` vor dem Veröffentlichen. Am sichersten bleibt: Dein Arbeitsstand liegt in einem **privaten** Repo.
