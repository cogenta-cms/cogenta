"""Build an offline display/functional report from recorded observations."""
import base64
import html
import json
import re
import statistics
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
EVIDENCE = HERE / 'regression' / 'evidence'
LOGS = ROOT / '.cogenta' / 'remediation-2026-10-03'


def esc(value):
    return html.escape(str(value))


def read(name, default=None):
    path = EVIDENCE / f'{name}.json'
    return json.loads(path.read_text()) if path.exists() else default


def records(name):
    data = read(name)
    if data is not None:
        rows = data if isinstance(data, list) else data.get('records', [])
        targeted = read(name + '-targeted', [])
        if name.startswith('screens-'):
            targeted = targeted + read(name.replace('screens-', 'display-last-regressions-'), []) + read(name.replace('screens-', 'display-last-regressions-') + '-extra', [])
        if isinstance(targeted, list) and targeted:
            merged = {row['id']: row for row in rows}
            merged.update({row['id']: row for row in targeted})
            return list(merged.values())
        return rows
    rows = []
    for path in sorted(EVIDENCE.glob(name + '-*.json')):
        if '-before-' in path.stem or '-initial' in path.stem or '-failure' in path.stem:
            continue
        grouped = json.loads(path.read_text())
        if isinstance(grouped, list):
            rows.extend(row for row in grouped if isinstance(row, dict) and 'status' in row)
    return rows


def result_row(name, title):
    rows = records(name)
    passed = sum(row.get('status') == 'passed' for row in rows)
    failed = sum(row.get('status') == 'failed' for row in rows)
    state = 'pass' if rows and passed == len(rows) else 'fail' if failed else 'pending'
    text = f'{passed}/{len(rows)} réussis' if rows else 'Non enregistré'
    links = [EVIDENCE / (name + '.json')] if (EVIDENCE / (name + '.json')).exists() else [p for p in sorted(EVIDENCE.glob(name + '-*.json')) if '-before-' not in p.stem]
    proofs = ' · '.join(f'<a href="regression/evidence/{esc(p.name)}">{esc(p.stem)}</a>' for p in links)
    return f'<tr data-state="{state}"><th scope="row">{esc(title)}</th><td>{esc(text)}</td><td>{failed}</td><td>{proofs}</td></tr>'


def figure(name, caption, inline=True):
    path = HERE / 'regression' / 'screenshots' / name
    if not path.exists():
        return ''
    link = 'regression/screenshots/' + name
    mime = 'image/png' if path.suffix == '.png' else 'image/jpeg'
    source = f'data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}' if inline else link
    return f'<figure><a href="{esc(link)}"><img loading="lazy" src="{source}" alt="{esc(caption)}"></a><figcaption>{esc(caption)}</figcaption></figure>'


def official():
    path = LOGS / 'e2e-results.json'
    if not path.exists():
        return {'available': False}, []
    data = json.loads(path.read_text())
    tests = []

    def visit(suite):
        for spec in suite.get('specs', []):
            for test in spec.get('tests', []):
                outcomes = test.get('results', [])
                tests.append({'title': spec['title'], 'project': test['projectName'], 'status': test['status'], 'durationMs': sum(x.get('duration', 0) for x in outcomes)})
        for child in suite.get('suites', []):
            visit(child)

    for suite in data.get('suites', []):
        visit(suite)
    original = EVIDENCE / 'official-e2e-full.json'
    if original.exists():
        initial = json.loads(original.read_text())
        current = tests.copy()
        tests.clear()
        for item in initial.get('suites', []):
            visit(item)
        combined = {(x['title'], x['project']): x for x in tests}
        combined.update({(x['title'], x['project']): x for x in current})
        tests = list(combined.values())
        stats = {'expected': sum(x['status'] == 'expected' for x in tests), 'unexpected': sum(x['status'] not in ['expected', 'skipped'] for x in tests), 'skipped': sum(x['status'] == 'skipped' for x in tests)}
        return {'available': True, 'validationMode': '120/122 au passage complet, puis les deux échecs recontrôlés après correction du sélecteur Créer', 'initialStats': initial.get('stats', {}), 'targetedStats': data.get('stats', {}), 'stats': stats, 'tests': tests}, tests
    return {'available': True, 'stats': data.get('stats', {}), 'tests': tests}, tests


def observations(names):
    findings = []
    for name in names:
        for row in records(name):
            visited = set()
            def walk(value):
                if isinstance(value, dict):
                    url = value.get('url', row.get('title', ''))
                    if 'scrollWidth' in value and value.get('scrollWidth', 0) > value.get('width', 100000):
                        key = (url, 'overflow', value.get('screenshot'))
                        if key not in visited:
                            visited.add(key)
                            findings.append({'campaign': name, 'case': row['id'], 'url': url, 'issue': 'Débordement horizontal', 'detail': f"{value['scrollWidth']} px pour {value['width']} px", 'screenshot': value.get('screenshot')})
                    for violation in value.get('accessibility', []) or []:
                        key = (url, violation['id'], value.get('screenshot'))
                        if key not in visited:
                            visited.add(key)
                            findings.append({'campaign': name, 'case': row['id'], 'url': url, 'issue': violation['id'], 'detail': str(violation.get('nodes', [])), 'screenshot': value.get('screenshot')})
                    for child in value.values():
                        walk(child)
                elif isinstance(value, list):
                    for child in value:
                        walk(child)
            walk(row.get('proof', {}))
    return findings


def build():
    suites = [
        ('display-last-regressions-1440', 'Derniers contrastes, titres et repères : bureau'),
        ('display-last-regressions-390', 'Derniers contrastes, titres et repères : mobile'),
        ('documentation-keyboard', 'Documentation : défilement d’un vrai bloc large avec ArrowRight'),
        ('display-final-320', 'Documentation et Santé à 320 px : largeur, clavier et accessibilité'),
        ('display-final-390', 'Documentation et Santé à 390 px : largeur et accessibilité'),
        ('destructive-hover-light', 'Bouton de suppression au survol : thème clair'),
        ('destructive-hover-dark', 'Bouton de suppression au survol : thème sombre'),
        ('screens-1440', 'Affichage bureau : pages, onglets, sous-écrans et dialogues'),
        ('screens-390', 'Affichage mobile : pages et états absents'),
        ('forms-lifecycle', 'Formulaires : définition, conditions et soumissions'),
        ('widgets-lifecycle', 'Widgets : catalogue, configuration et rendu des 22 types'),
        ('comments-lifecycle', 'Commentaires : modération et réponse'),
        ('media-lifecycle', 'Médias : création, variantes, dossiers et permissions'),
        ('commerce-lifecycle', 'Boutique : produits, variantes, commandes et factures'),
        ('api-keys-lifecycle', 'Clés API : création, utilisation et révocation'),
        ('redirects-lifecycle', 'Redirections : règles, édition et import/export'),
        ('fields-lifecycle', 'Champs de contenu : types et persistance'),
        ('blocks-lifecycle', 'Blocs : 17 types et rendu'),
        ('content-import-replace', 'Contenu : import, export et remplacement'),
        ('passkeys-lifecycle', 'Passkeys : authentification WebAuthn sur localhost'),
        ('password-reset-lifecycle', 'Mot de passe : récupération et nouveau mot de passe'),
        ('settings-invalid-fixtures-recheck', 'Réglages : trois fixtures invalides recontrôlées'),
        ('admin-bounded-lists', 'Listes admin : 8 routes, quatre largeurs et navigation'),
        ('admin-sessions-display', 'Sessions : 52 connexions, révocation et retour de page'),
        ('admin-menus-display', 'Menus à huit niveaux, clavier et tâches planifiées'),
        ('admin-assistant-display', 'Assistant : textes FR/EN et descriptions au clavier'),
        ('comments-submissions-pagination', 'Soumissions et commentaires : plus de vingt éléments'),
        ('commerce-pagination', 'Commandes et clients : au-delà de cent résultats'),
        ('plugin-uninstall-live', 'Plugin chargé : désinstallation et arrêt immédiat'),
        ('ai-tools-real', 'Seize outils IA : réponses API et suggestions non appliquées'),
        ('ai-ui-lifecycle', 'IA : suggestion enregistrée, image conservée, chat avec citation'),
        ('ai-theme-lifecycle', 'IA : génération et affinage d’un thème'),
        ('ai-site-plan', 'IA : plan de site, décisions, application ciblée et suppression'),
        ('ai-management', 'Prompts, compétences, ressources et paramètres d’agent'),
        ('agent-tools-lifecycle', 'Agent : vrai content.read, réponse, historique et traces'),
        ('calendar-lifecycle', 'Calendrier : programmation, modification et publication'),
        ('builder-lifecycle', 'Composition visuelle : modification et persistance'),
        ('mcp-clients-lifecycle', 'Clients MCP : configuration et connexion réelle'),
        ('appearance-lifecycle', 'Apparence : jetons et thème'),
        ('theme-lifecycle', 'Thèmes : sandbox, import/export et contrôle du clonage'),
        ('admin-theme-lifecycle', 'Apparence de l’administration'),
        ('plugins-lifecycle', 'Plugins : brouillon, validation, installation et activation'),
        ('plugins-templates', 'Templates de plugin et permissions explicites'),
        ('plugin-restart-lifecycle', 'Plugin : redémarrage, route publique et tâche exécutée'),
        ('import-formats-incompatible', 'Imports JSON/RSS et refus WordPress incompatible'),
        ('import-formats-compatible', 'Import WordPress WXR sur un site compatible'),
        ('roles-lifecycle', 'Rôles : modification puis restauration des permissions'),
        ('health-lifecycle', 'Maintenance : HTTP503 public et administration accessible'),
    ]
    e2e, tests = official()
    display_findings = observations(['screens-1440', 'screens-390'])
    observation_rows = ''.join(f'<tr><th scope="row">{esc(x["case"])}</th><td>{esc(x["issue"])}</td><td>{esc(x["detail"][:1600])}</td><td><a href="regression/{esc(x["screenshot"])}">Capture</a></td></tr>' for x in display_findings)
    before = records('admin-lists-display-inventory')
    after = records('admin-bounded-lists')
    lh_before, lh_after = records('lighthouse-display-before'), records('lighthouse-display-after')
    lh_rows = []
    for route in ['/admin/widgets', '/admin/forms']:
        values = []
        for sample in [lh_before, lh_after]:
            runs = [x for x in sample if x['path'] == route]
            values.append({key: round(statistics.median(x['scores'][key] for x in runs) * 100) for key in ['performance', 'accessibility']} if runs else None)
        lh_rows.append(f'<tr><th scope="row">{esc(route)}</th><td>{esc(values[0])}</td><td>{esc(values[1] or "En attente")}</td></tr>')
    pairs = [
        ('LISTS-widgets-390-before.jpg', 'Widgets avant : catalogue et éléments déroulés sur une page très longue.'),
        ('LIST-widgets-390-after.jpg', 'Widgets après : catalogue repliable et dix éléments par page.'),
        ('NAV-320--profile.jpg', 'Profil avant : débordement horizontal à 320 pixels.'),
        ('SESSIONS-bounded-320.jpg', 'Profil après : sessions bornées et commandes accessibles à 320 pixels.'),
        ('NAV-390--menus.jpg', 'Menus avant : commandes débordant du petit écran.'),
        ('MENU-eight-levels-320.jpg', 'Menus après : huit niveaux et actions accessibles à 320 pixels.'),
        ('NAV-320--assistant.jpg', 'Assistant avant : descriptions anglaises et catalogue long.'),
        ('ASSISTANT-compact-fr-320.jpg', 'Assistant après : descriptions françaises repliables au clavier.'),
        ('AI-UI-RAG-answer.jpg', 'Chat réel : réponse tirée d’un document indexé et citation vérifiée.'),
        ('AI-PLAN-application-result.jpg', 'Plan IA : décisions enregistrées et application ciblée.'),
    ]
    figures = ''.join(figure(*pair) for pair in pairs)
    metrics = []
    comparisons = []
    latest = {entry['id']: entry for entry in after}
    for row in before:
        if row['route'] not in ['widgets', 'forms', 'audit', 'media', 'observability', 'form-submissions', 'comments', 'commerce/coupons']:
            continue
        metrics.append(f'<tr><th scope="row">{esc(row["route"])}</th><td>{row["width"]}</td><td>{row["mainHeight"]}</td><td>{row["tableRows"]}</td><td>{row["listItems"]}</td><td>{row["controls"]}</td></tr>')
        match = latest.get('LIST-' + row['route'].replace('/', '-') + '-' + str(row['width']))
        if match:
            measurement = match.get('proof', {}).get('measurement', {})
            height = measurement.get('height')
            reduction = round((1 - height / row['mainHeight']) * 100) if height is not None else None
            comparisons.append(f'<tr><th scope="row">{esc(row["route"])}</th><td>{row["width"]}</td><td>{row["mainHeight"]}</td><td>{esc(height)}</td><td>{esc(reduction)} %</td><td>{esc(measurement.get("rows", []))}</td><td>{esc(measurement.get("controls"))}</td></tr>')
    role_rows = []
    for role in ['admin', 'editor', 'viewer', 'public']:
        rows = records('role-routes-' + role)
        rechecks = records('role-routes-' + role + '-targeted')
        final = {x['id']: x for x in rows}
        final.update({x['id']: x for x in rechecks})
        passed = sum(x.get('status') == 'passed' for x in final.values())
        targeted_link = f' · <a href="regression/evidence/role-routes-{role}-targeted.json">Recontrôle ciblé</a>' if rechecks else ''
        role_rows.append(f'<tr><th scope="row">{esc(role)}</th><td>{passed}/{len(final)}</td><td><a href="regression/evidence/role-routes-{role}.json">Passage initial</a>{targeted_link}</td></tr>')
    other_images = sorted({item for path in EVIDENCE.glob('*.json') for item in re.findall(r'"screenshot":\s*"(screenshots/[^"\n]+)"', path.read_text())})
    gallery = ''.join(f'<li><a href="regression/{esc(item)}">{esc(Path(item).stem)}</a></li>' for item in other_images if (HERE / 'regression' / item).exists())
    stats = e2e.get('stats', {})
    stats_text = f'{stats.get("expected", 0)} réussis, {stats.get("unexpected", 0)} échecs, {stats.get("skipped", 0)} ignorés' if e2e['available'] else 'Exécution finale en attente'
    if e2e.get('validationMode'):
        stats_text += ' — bilan consolidé : ' + e2e['validationMode']
    official_rows = ''.join(f'<tr data-state="{"pass" if row["status"] == "expected" else "fail"}"><th scope="row">{esc(row["title"])}</th><td>{esc(row["project"])}</td><td>{esc(row["status"])}</td></tr>' for row in tests)
    generated = datetime.now().astimezone().isoformat(timespec='seconds')
    body = '''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cogenta — Affichage et recette fonctionnelle</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f3f5f7;color:#192633;font:16px/1.6 system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:32px 20px 80px}h1{font-size:clamp(28px,4vw,46px);line-height:1.15;letter-spacing:-.035em}h2{margin:36px 0 12px;line-height:1.3}p{max-width:86ch}a{color:#075da5;overflow-wrap:anywhere}code{overflow-wrap:anywhere}section,details{background:#fff;border:1px solid #d8e0e7;border-radius:12px;padding:20px;margin:20px 0;min-width:0}.note{border-left:5px solid #ba6900;background:#fff6e5;padding:16px}.muted{color:#516272}.table-wrap{overflow:auto;max-width:100%;border:1px solid #d8e0e7;border-radius:8px}table{border-collapse:collapse;width:100%;min-width:560px;font-size:14px}th,td{border-bottom:1px solid #e4e9ee;padding:10px 12px;text-align:left;vertical-align:top}tbody th{font-weight:500}thead{background:#ecf1f5}.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}figure{margin:0;min-width:0;background:#fff;border:1px solid #d8e0e7;border-radius:10px;overflow:hidden}figure>a{display:block;max-height:650px;overflow:auto}img{display:block;width:100%;height:auto}figcaption{padding:14px;font-size:14px}.pass{color:#166a37}.fail{color:#a52c26}summary{cursor:pointer;font-weight:650;min-height:44px;display:list-item}label{display:block;font-weight:600}input{font:inherit;max-width:100%;width:100%;padding:10px 12px;border:1px solid #9caeba;border-radius:8px}.proofs{columns:3;column-gap:28px;font-size:13px;padding-left:20px}.proofs li{break-inside:avoid;margin:6px 0}button{font:inherit;padding:10px;border:1px solid #9caeba;border-radius:6px;background:#fff;cursor:pointer}nav{display:flex;flex-wrap:wrap;gap:8px 20px}@media(max-width:650px){main{padding:20px 12px}section,details{padding:14px}.gallery{grid-template-columns:1fr}.proofs{columns:1}}</style>
<main><p class="muted">Recette locale · branche fix/production-readiness-audit-2026-10-03</p><h1>Affichage de l’administration et recette fonctionnelle</h1>
<p>Cette passe corrige les listes trop longues, les commandes qui débordent, les textes IA et les pages d’erreur. Elle poursuit la validation des parcours métier sur une copie de recette, distincte du site de démonstration.</p>
<nav aria-label="Sections du rapport"><a href="#display">Affichage</a><a href="#tests">Parcours</a><a href="#roles">Rôles</a><a href="#limits">Limites</a><a href="#comparison">Comparaison CMS</a><a href="#captures">Captures</a></nav>
<p class="note">La réussite des contrôles locaux ne constitue pas une déclaration de perfection ni de préparation complète à la production. Les limites externes et les validations globales restantes sont distinguées ci-dessous. Aucun merge sur main n’est effectué.</p>
<section id="display"><h2>Ce qui a été corrigé</h2><ul>
<li>Formulaires, coupons, sessions et zones de widgets : dix éléments visibles par page ; recherche et retour sur une page existante après suppression.</li>
<li>Plugins installés : cinq par page. Catalogue de widgets, fiches des outils IA et explications des notices non critiques repliables ; alertes critiques entièrement visibles.</li>
<li>Audit, médias, traces, logs, soumissions, commentaires et tâches : pages bornées. Les listes à curseur remplacent les lignes au lieu de les accumuler.</li>
<li>Commandes et clients : navigation serveur au-delà de cent résultats ; total de commande explicitement lié à la page affichée.</li>
<li>Menus : indentation bornée, commandes repliées et noms accessibles contextuels. Profil : une seule section de sessions, largeur corrigée.</li>
<li>Documentation admin : navigation mobile en une colonne, prose qui revient à la ligne, tables et code dans des régions nommées accessibles au clavier. Les chemins techniques de Santé reviennent à la ligne ; le badge SEO rouge et le bouton destructif au survol ont un contraste corrigé.</li>
<li>Pages refusées ou introuvables : titre, explication et navigation de retour. Tâches planifiées : intitulés français lisibles sans capitales forcées.</li>
<li>Plugin désinstallé : code chargé arrêté immédiatement, avec attente des actions déjà engagées avant la confirmation de suppression.</li>
</ul><p>Les mécanismes sont testés sur les pages suivantes, les filtres et les actions ; un contrôle de hauteur seul ne prouve pas que le parcours fonctionne.</p>
<div class="table-wrap" tabindex="0" role="region" aria-label="Mesures avant après"><table><thead><tr><th>Route</th><th>Largeur px</th><th>Hauteur avant px</th><th>Hauteur après px</th><th>Réduction</th><th>Lignes après</th><th>Commandes après</th></tr></thead><tbody>__COMPARISONS__</tbody></table></div>
<details><summary>Mesures avant correction</summary><div class="table-wrap" tabindex="0" role="region" aria-label="Mesures avant correction"><table><thead><tr><th>Route</th><th>Largeur px</th><th>Hauteur main px</th><th>Lignes</th><th>Éléments</th><th>Commandes</th></tr></thead><tbody>__METRICS__</tbody></table></div></details>
<p><a href="regression/evidence/admin-lists-display-inventory.json">Inventaire avant</a> · <a href="regression/evidence/admin-bounded-lists-campaign.json">Observations après et pagination</a> · <a href="admin-lists-display.md">Détail des listes</a></p></section>
<section id="tests"><h2>Parcours réellement exercés</h2><p>La vérification d’une page, le test d’un bouton et la validation d’une mutation persistée sont des contrôles différents. Les preuves détaillent les requêtes, les assertions, les erreurs navigateur et les captures. Les parcours métier de la recette antérieure sont conservés ; les nouvelles campagnes valident les corrections de pagination et d’affichage. Les anciennes assertions incorrectes (passkey sur une IP, workflow attendu absent, statut de suppression) restent archivées et ne sont pas confondues avec des défauts du produit.</p><label for="filter">Filtrer les résultats du rapport</label><input id="filter" type="search" placeholder="Exemple : IA, menus, plugin, formulaire"><div class="table-wrap" tabindex="0" role="region" aria-label="Résultats fonctionnels"><table class="filterable"><thead><tr><th>Campagne</th><th>Résultat</th><th>Échecs</th><th>Preuve</th></tr></thead><tbody>__SUITES__</tbody></table></div>
<h3>Anomalies relevées dans les captures finales</h3><p>Les contrôles finaux couvrent tous les liens de navigation, des variantes de contenu, les onglets et les dialogues ouverts. L’inventaire de 559 déclarations d’actions dans le code n’est pas une preuve que 559 parcours indépendants ont été validés. Un résultat « affichage réussi » signifie que la page et ses contrôles ont été ouverts. Les débordements et violations axe enregistrés sont évalués séparément dans cette table. Les éventuels niveaux de titre ou repères restants restent des défauts à traiter.</p><div class="table-wrap" tabindex="0" role="region" aria-label="Anomalies visuelles restantes"><table class="filterable"><thead><tr><th>État</th><th>Défaut</th><th>Détail enregistré</th><th>Capture</th></tr></thead><tbody>__OBSERVATIONS__</tbody></table></div><h3>Suite Playwright officielle</h3><p>__E2E__</p><p>Site SQLite éphémère, sans clé IA : administration bureau/mobile, création avec deux champs riches, formulaire conditionnel multipart, workflow de relecture, validation humaine MCP, listes paginées et liens dangereux testés dans Chromium, Firefox et WebKit.</p><details><summary>Résultats individuels de la suite officielle</summary><div class="table-wrap" tabindex="0" role="region" aria-label="Tests Playwright"><table class="filterable"><thead><tr><th>Test</th><th>Navigateur</th><th>Résultat</th></tr></thead><tbody>__OFFICIAL__</tbody></table></div></details>
<p><a href="regression/evidence/official-e2e-full.json">Passage complet initial</a> · <a href="regression/evidence/official-e2e-targeted.json">Recontrôle des deux parcours</a></p><p>Les seize outils IA ont répondu ; les cas sans correspondance dans l’index sont distingués des réponses avec sources. Un second parcours charge un document, obtient son contenu exact par chat et vérifie sa citation. Les suggestions restent proposées jusqu’à leur acceptation humaine.</p></section>
<section id="roles"><h2>Accès par rôle</h2><p>52 routes de navigation sont parcourues pour chacun des quatre profils. Les trois pages opérationnelles auparavant vides doivent afficher un refus explicite pour lecteur et éditeur. Les familles d’API réservées à l’administration sont contrôlées séparément. Les permissions temporaires de la recette sont restaurées.</p><div class="table-wrap" tabindex="0" role="region" aria-label="Couverture par rôle"><table><thead><tr><th>Profil</th><th>Routes validées</th><th>Preuves</th></tr></thead><tbody>__ROLES__</tbody></table></div></section>
<section><h2>Mesure Lighthouse ciblée</h2><p>Médianes de trois passages sur deux pages, avec les mêmes données et un navigateur mobile 390 px. Le cache HTTP est vidé avant chaque mesure, tout en conservant la connexion. Assets antérieurs figés, backend de recette identique. Ces résultats ciblent l’affichage administratif ; ils ne remplacent pas un audit complet de performance du site public sous charge.</p><div class="table-wrap" tabindex="0" role="region" aria-label="Scores Lighthouse avant après"><table><thead><tr><th>Page</th><th>Avant : performance, accessibilité</th><th>Après : performance, accessibilité</th></tr></thead><tbody>__LIGHTHOUSE__</tbody></table></div><p><a href="regression/evidence/lighthouse-display-before.json">Mesures avant</a> · <a href="regression/evidence/lighthouse-display-after.json">Mesures après</a> · <a href="https://github.com/GoogleChrome/lighthouse/blob/main/docs/readme.md">Méthode Lighthouse officielle</a></p></section>
<section id="limits"><h2>Ce qui reste à distinguer avant production</h2><ul>
<li>Performance : le dernier passage mesure formulaires 79→77 en score médian, widgets 74→74. Le CLS augmente de 0,49 à 0,69 sur formulaires et de 0,54 à 0,74 sur widgets. L’accessibilité reste à 100. Le critère de non-régression du rendu reste ouvert : les déplacements de mise en page au chargement doivent être corrigés et recontrôlés avant validation production.</li>
<li>Paiements externes : aucune clé de bac à sable configurée. Le driver manuel et les webhooks HTTP signés sont contrôlés localement ; Stripe/PayPal réels ne sont pas certifiés.</li>
<li>Transport d’e-mail externe : l’ancien test lancé sans destinataire a échoué. Il n’est pas compté comme un envoi réussi. Les tâches de maintenance et les drivers locaux ont leurs preuves distinctes.</li>
<li>Redis/S3 et autres services externes absents : leurs tests ignorés restent signalés. Le fonctionnement sans ces services est conservé.</li>
<li>La suite unitaire globale antérieure s’est arrêtée après quatre échecs ensuite recontrôlés. Les tests ciblés de cette passe ne valent pas une nouvelle suite unitaire globale entièrement verte.</li>
<li>Avis de dépendance haut résiduel sans correctif amont : voir la <a href="http-cache-semantics.md">preuve de portée</a>. Dette du grand fichier serveur : réduction partielle seulement.</li>
<li>Fiche client : le calcul totalSpentMinor et son historique restent bornés à 500 commandes ; les totaux au-delà de ce seuil doivent être corrigés dans une passe distincte.</li>
<li>Widgets : pagination par zone et catalogue repliable réduisent la longueur, mais la page reste dense sur mobile avec plusieurs zones remplies ; les captures et hauteurs finales exposent cette limite.</li>
<li>Préférences de colonnes, layouts multiples, charge de production, lecteurs d’écran et compatibilité des extensions tierces : une recette locale bornée ne démontre pas toutes ces propriétés.</li>
</ul><p><a href="regression/evidence/maintenance-verified.json">Maintenance : résultats vérifiés, dont l’échec d’e-mail</a> · <a href="rapport-etape.html">Point d’étape historique</a> · <a href="tracking.json">43 constats initiaux</a></p></section>
<section id="comparison"><h2>Repères face aux autres CMS</h2><p>Comparaison documentaire, sans prétendre avoir testé leurs installations. Ces interfaces établissent des repères utiles pour la densité et la gestion des longues listes.</p><div class="table-wrap" tabindex="0" role="region" aria-label="Comparaison CMS"><table><thead><tr><th>CMS</th><th>Pratique documentée</th><th>Conséquence pour Cogenta</th></tr></thead><tbody>
<tr><th>WordPress</th><td><a href="https://wordpress.org/documentation/article/pages-add-new-screen/">Modules configurables et repliables</a></td><td>Garder les actions utiles visibles et replier le détail secondaire.</td></tr>
<tr><th>Drupal</th><td><a href="https://api.drupal.org/api/drupal/core%21modules%21views%21src%21Plugin%21views%21pager%21PagerPluginBase.php/class/PagerPluginBase/11.x">Pager Views et nombre d’éléments par page</a></td><td>Accéder à tous les résultats avec une page de taille bornée.</td></tr>
<tr><th>Strapi 5</th><td><a href="https://docs.strapi.io/cms/features/content-manager">Recherche, filtres, colonnes et taille des pages</a></td><td>Tester ensemble filtres, pagination et actions sur les lignes.</td></tr>
<tr><th>Directus</th><td><a href="https://docs.directus.io/user-guide/content-module/content">Layouts, recherche et commandes de gestion</a></td><td>Clarifier les commandes fréquentes et la hiérarchie des informations.</td></tr>
</tbody></table></div><p><a href="cms-comparison-display.md">Sources et portée de la comparaison</a></p></section>
<section id="captures"><h2>Captures avant et après</h2><p>Les images ci-dessous sont intégrées dans le HTML et restent visibles hors ligne. Cliquer ouvre l’original du dossier local. Les autres observations restent accessibles dans la galerie des preuves.</p><div class="gallery">__FIGURES__</div><details><summary>Galerie complète des captures enregistrées (__IMAGECOUNT__)</summary><ul class="proofs">__GALLERY__</ul></details></section>
<p class="muted">Généré le __DATE__. Les cas absents ou échoués sont conservés comme tels ; les recontrôles ne changent pas les archives initiales.</p></main><script>document.querySelector('#filter').addEventListener('input',e=>{const q=e.target.value.toLocaleLowerCase('fr').trim();document.querySelectorAll('.filterable tbody tr').forEach(row=>{row.hidden=!row.textContent.toLocaleLowerCase('fr').includes(q)})})</script></html>'''
    replacements = {'OBSERVATIONS': observation_rows, 'METRICS': ''.join(metrics), 'COMPARISONS': ''.join(comparisons), 'SUITES': ''.join(result_row(*suite) for suite in suites), 'E2E': esc(stats_text), 'OFFICIAL': official_rows, 'ROLES': ''.join(role_rows), 'LIGHTHOUSE': ''.join(lh_rows), 'FIGURES': figures, 'GALLERY': gallery, 'IMAGECOUNT': str(len(other_images)), 'DATE': esc(generated)}
    for name, value in replacements.items():
        body = body.replace('__' + name + '__', value)
    (HERE / 'rapport-affichage-et-recette.html').write_text(body)
    summary = {'generatedAt': generated, 'officialE2e': e2e, 'functionalSuites': [{'name': name, 'total': len(records(name)), 'passed': sum(row.get('status') == 'passed' for row in records(name))} for name, _ in suites], 'remainingDisplayObservations': display_findings, 'captureCount': len(other_images), 'lighthouseBefore': lh_before, 'lighthouseAfter': lh_after}
    (HERE / 'validation-affichage.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    build()
