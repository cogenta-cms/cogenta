"""Build the offline checkpoint report from existing, redacted QA evidence."""
import base64
import html
import json
import re
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
EVIDENCE = HERE / 'regression' / 'evidence'
LOGS = ROOT / '.cogenta' / 'remediation-2026-10-03'


def escape(value):
    return html.escape(str(value))


def records(name):
    path = EVIDENCE / (name + '.json')
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    return data if isinstance(data, list) else data.get('records', [])


def log_tail(name):
    path = LOGS / name
    if not path.exists():
        return 'Non disponible'
    text = re.sub(r'\x1b\[[0-9;]*m', '', path.read_text())
    return '\n'.join(text.splitlines()[-12:])


REPAIRS = {
    'SEC-01': 'Filtrage partagé des URL de menu à la création et au rendu des données héritées.',
    'SEC-02': 'Dépendances actualisées : 33 avis initiaux → 1 avis haut résiduel sans correctif amont. Preuve de portée du consommateur Astro conservée.',
    'SEC-03': 'Écriture média réservée aux rôles autorisés, vérifiée dans la couche REST/MCP centrale.',
    'MCP-01': 'Audit, autonomie et file persistante de validation humaine ; interface de décision réservée à un administrateur humain.',
    'MCP-02': 'Assemblage commun des stores décorés, index et effets dérivés entre serveur HTTP et MCP.',
    'MCP-03': 'Locale par défaut du site transmise au serveur MCP.',
    'UI-01': 'En-tête, recherche et navigation adaptés aux petits écrans ; recontrôle des 54 routes à quatre largeurs.',
    'FORM-01': 'Conditions showIf appliquées dans le navigateur et validées par le serveur, avec parcours sans JavaScript.',
    'PAY-01': 'Traitement HTTP des webhooks sur corps brut, vérification de signature, montant/devise et transitions idempotentes.',
    'QA-01': 'Harness Playwright officiel ajouté ; trois parcours métier passent. La totalité des nouvelles suites reste à exécuter.',
    'SEC-04': 'Timestamp absent refusé par la protection anti-robot des commentaires.',
    'I18N-01': 'Clés de traduction des notifications de sécurité disponibles en français et anglais.',
    'I18N-02': 'Confirmation des nouveaux formulaires et notifications adaptée à la locale du site.',
    'A11Y-01': 'Contrastes des presets administratifs et styles ajustés, validation des tokens.',
    'A11Y-02': 'Noms accessibles des champs riches et commandes de l’éditeur.',
    'A11Y-03': 'Structure ARIA des onglets Marketplace et Corbeille corrigée.',
    'A11Y-04': 'Cibles tactiles des dossiers média et liens Portfolio agrandies.',
    'A11Y-05': 'Région du calendrier scrollable nommée et accessible au clavier.',
    'A11Y-06': 'Titres, repères et noms contextuels corrigés, dont soumissions et modération répétée.',
    'UI-02': 'Largeur du thème Documentation et recherche corrigée.',
    'UI-03': 'Widgets, tâches planifiées, relecture, assistant et réglages adaptés aux petits écrans.',
    'TEXT-01': 'Statuts et dates localisés ; actions d’audit affichées en langage métier.',
    'TEXT-02': 'Texte du widget de sauvegarde remplacé par une explication orientée action.',
    'TEXT-03': 'Usage et limite budgétaire distingués, état du fournisseur explicite.',
    'SEO-01': 'Descriptions d’accueil FR/EN ajoutées aux nouveaux sites Vitrine et Blog ; contenu existant respecté.',
    'SEO-02': 'Favicon par défaut servi, personnalisation et repli vérifiés par HTTP.',
    'PERF-01': 'Mesure Lighthouse dédiée avant/après non achevée ; aucune conclusion de non-régression.',
    'UI-04': 'Présentation des logos de thèmes ajustée.',
    'CODE-01': 'Extraction de l’assemblage commun des stores ; le très grand fichier serveur demeure une dette technique.',
    'DOC-01': 'BLOCKERS, contrats et guides actualisés ; constats historiques conservés comme tels.',
    'SETTING-01': 'Authentification ajoutée aux appels de réglages ; 32 contrôles exercés, trois fixtures invalides remplacées par des valeurs valides.',
    'WORKFLOW-01': 'Workflow exposé dans le schéma ; parcours éditeur → relecture administrateur → publication vérifié.',
    'EDITOR-01': 'Documents Slate vides distincts pour chaque champ ; création sans collision d’objets.',
    'FORM-02': 'Valeurs multiples multipart préservées, y compris le premier choix.',
    'BLOCK-01': 'Validation des blocs et paramètres collectionList avant écriture ; ancien bloc invalide omis avec diagnostic.',
    'IMPORT-01': 'Préflight WordPress : collection incompatible refusée avant toute écriture. Le scénario historique qui attendait une importation réussie doit être adapté.',
    'AI-01': 'Outil http.fetch enregistré avec périmètre d’origine restreint ; agent d’accessibilité exécuté réellement.',
    'AI-02': 'Recherche des références et locale und activée ; citations exactes vérifiées avec fournisseurs opérationnels.',
    'AI-03': 'Activation synchronisée avant réponse ; exécution immédiate réelle sans délai ajouté.',
    'THEME-01': 'Clonage proposé seulement pour les thèmes locaux pris en charge.',
    'PLUGIN-01': 'Empreinte des extensions au démarrage et indication explicite de redémarrage nécessaire.',
    'THEME-02': 'Tokens de base fusionnés avec les modifications partielles ; enregistrement sur thème sans fichier de tokens vérifié.',
    'DOC-02': 'Lien interne de documentation corrigé.',
}


def build():
    tracking = json.loads((HERE / 'tracking.json').read_text())
    for finding in tracking['findings']:
        identifier = finding['id']
        finding['status'] = {
            'SEC-02': 'residual_risk', 'PERF-01': 'not_validated',
            'CODE-01': 'partially_addressed',
        }.get(identifier, 'implemented_validation_partial')
        finding['correction'] = REPAIRS.get(identifier, 'Voir le diff et les preuves ciblées.')
    tracking['checkpoint'] = '2026-10-04 — arrêt de périmètre demandé par l’utilisateur'
    tracking['productionReady'] = False
    tracking['mergePerformed'] = False
    (HERE / 'tracking.json').write_text(json.dumps(tracking, ensure_ascii=False, indent=2) + '\n')

    suites = [
        ('commerce-basic', 'Boutique : produits, coupons, taxes, livraison'),
        ('commerce-lifecycle', 'Boutique : paiement manuel, PDF, livraison, remboursement, anonymisation'),
        ('commerce-subscriptions', 'Abonnements : pause, reprise, changement, résiliation'),
        ('forms-lifecycle', 'Formulaires : conditions, multipart, export et gestion'),
        ('comments-lifecycle', 'Commentaires : réponse, spam, corbeille et restauration'),
        ('widgets-lifecycle', 'Widgets : types, édition, déplacement, visibilité, duplication'),
        ('menus-lifecycle', 'Menus : types, ordre, déplacement, duplication, suppression'),
        ('media-lifecycle', 'Médias : import, recadrages, rotations, retournements'),
        ('media-folders-lifecycle', 'Dossiers média : gestion et permissions'),
        ('redirects-lifecycle', 'Redirections : règles et cycle de gestion'),
        ('blocks-lifecycle', '17 blocs : édition, publication et rendu public'),
        ('content-import-replace', 'Import de contenu : gestion des remplacements'),
        ('ai-corrections-targeted', 'IA réelle : outil, activation, références et rôles'),
        ('passkeys-lifecycle', 'WebAuthn : inscription et connexion sur localhost'),
        ('api-keys-lifecycle', 'Clés API : cycle de gestion'),
        ('password-reset-lifecycle', 'Réinitialisation du mot de passe'),
        ('dashboard-channels', 'Tableau de bord et canaux'),
    ]
    rows = []
    for name, label in suites:
        items = records(name)
        passed = sum(item.get('status') == 'passed' for item in items)
        failed = sum(item.get('status') == 'failed' for item in items)
        rows.append(f'<tr><td>{escape(label)}</td><td>{passed}/{len(items)}</td>'
                    f'<td>{failed}</td><td><a href="regression/evidence/{name}.json">Preuve JSON</a></td></tr>')
    navigation = []
    for width in [320, 390, 768, 1440]:
        items = records('navigation-' + str(width))
        passed = sum(item.get('status') == 'passed' for item in items)
        failures = ', '.join(item['id'].split('--')[-1] for item in items if item.get('status') == 'failed')
        navigation.append(f'<tr><td>{width} px</td><td>{passed}/{len(items)}</td><td>{escape(failures or "Aucun échec")}</td></tr>')

    cards = []
    for finding in tracking['findings']:
        cards.append(f'<details class="finding"><summary>{escape(finding["priority"])} · '
                     f'{escape(finding["id"])} — {escape(finding["title"])}</summary>'
                     f'<p>{escape(finding["correction"])}</p>'
                     f'<p class="muted">Statut : {escape(finding["status"])}. '
                     'Ce statut ne signifie pas que tous les parcours et toutes les variantes ont été validés.</p></details>')

    figures = []
    captures = [
        ('NAV-320--assistant.jpg', 'Assistant à 320 px après correction des onglets. Les descriptions anglaises restent un point à traiter.'),
        ('NAV-390--menus.jpg', 'Défaut restant : les actions des éléments de menu débordent à 390 px.'),
        ('NAV-320--profile.jpg', 'Défaut restant : le profil déborde à 320 px.'),
        ('AI-02-reference-answer-mobile.jpg', 'Preuve fonctionnelle IA : réponse citant un document de référence. Capture antérieure au dernier correctif de largeur.'),
        ('APPEARANCE-tokens-saved.jpg', 'Preuve d’apparence si disponible ; les essais interrompus restent distingués dans les résultats.'),
    ]
    for name, caption in captures:
        path = HERE / 'regression' / 'screenshots' / name
        if not path.exists():
            continue
        encoded = base64.b64encode(path.read_bytes()).decode('ascii')
        figures.append(f'<figure><a href="regression/screenshots/{escape(name)}">'
                       f'<img loading="lazy" src="data:image/jpeg;base64,{encoded}" alt="{escape(caption)}"></a>'
                       f'<figcaption>{escape(caption)}</figcaption></figure>')

    gates = [
        ('Types stricts', 'typecheck-checkpoint.log'),
        ('Recontrôle de deux tests avec attentes actualisées', 'admin-expectations-final.log'),
        ('Recontrôle intermédiaire : formulaires/modération passent ; deux anciennes attentes encore échouées, résolues dans le recontrôle final ci-dessus', 'admin-failed-tests-recheck.log'),
        ('Validation humaine sur trois bases SQL', 'approvals-integration-recheck.log'),
        ('Sécurité des menus multi-navigateurs', 'e2e-menu-security-final.log'),
        ('Lint du point d’étape', 'lint-checkpoint-final.log'),
    ]
    gate_html = ''.join(f'<details><summary>{escape(title)}</summary><pre>{escape(log_tail(name))}</pre></details>' for title, name in gates)
    body = f'''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cogenta — point d’étape des corrections et tests</title>
<style>
:root{{color-scheme:light}}*{{box-sizing:border-box}}body{{margin:0;background:#f5f7fa;color:#172439;font:16px/1.6 system-ui,sans-serif;overflow-wrap:anywhere}}
main{{max-width:1120px;margin:auto;padding:24px}}h1{{font-size:clamp(1.7rem,4vw,2.7rem);line-height:1.2}}h2{{margin-top:2rem}}
a{{color:#174ea6}}.banner{{padding:18px;background:#fff0d4;border-left:5px solid #905900;border-radius:8px}}
table{{width:100%;border-collapse:collapse;background:white}}th,td{{padding:10px;text-align:left;vertical-align:top;border-bottom:1px solid #d7dde7}}
.scroll{{overflow:auto}}details{{background:white;margin:10px 0;border:1px solid #d7dde7;border-radius:8px;padding:12px}}
summary{{cursor:pointer;font-weight:600}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}}.muted{{color:#4b596b}}
.gallery{{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:20px}}figure{{margin:0;background:white;padding:12px;border:1px solid #d7dde7;border-radius:8px}}
img{{width:100%;height:420px;object-fit:contain;object-position:top}}figcaption{{font-size:14px}}li{{margin-bottom:8px}}
</style><main>
<h1>Cogenta : corrections et recette — point d’étape</h1>
<p>4 octobre 2026 · Branche <code>{escape(tracking['branch'])}</code><br>Référence initiale : <code>{escape(tracking['baseline'])}</code>.</p>
<div class="banner"><strong>Fusion non effectuée. CMS non déclaré prêt pour la production.</strong>
<p>À la demande de l’utilisateur, seuls les travaux déjà engagés ont été clôturés. Les campagnes supplémentaires sont laissées à sa décision. Les modifications sont présentes dans la branche et ne sont pas encore commitées.</p></div>
<h2>Ce qui a été corrigé et vérifié</h2>
<p>Les corrections couvrent sécurité REST/MCP, validation humaine, index dérivés, IA, formulaires, commentaires, paiement entrant, imports, workflows, texte riche, thèmes, traductions, responsive et accessibilité. Les preuves ci-dessous correspondent à des scénarios exécutés ; elles ne couvrent pas automatiquement chaque variante de chaque fonctionnalité.</p>
<p>Trois défauts supplémentaires ont été corrigés pendant la recette : migration MySQL sensible à la casse du nom de colonne, rendu HTTP 500 d’un champ de texte riche optionnel à null, et annulation/délai maximal d’un agent en attente de validation. Le formulaire de construction a également reçu ses libellés français.</p>
<div class="scroll"><table><thead><tr><th>Parcours réel</th><th>Passés / exécutés</th><th>Échecs</th><th>Preuve</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div>
<p>IA : cinq scénarios ciblés avec fournisseurs réellement opérationnels ; deux vérifications de fournisseur HTTP 200. Les nouvelles captures mobiles ne font aucun appel payant. Paiement : driver manuel, factures et webhook signés testés localement ; aucun paiement Stripe externe validé sans clés de bac à sable. WebAuthn a été recontrôlé sur localhost, domaine compatible avec le navigateur ; l’ancienne tentative sur une adresse IP ne constitue pas cette validation.</p>
<h2>Couverture de l’interface</h2>
<p>Navigation : 54 cas par largeur. Les inspections ouvrent aussi onglets, sous-écrans, panneaux et dialogues. Une inspection d’écran ne remplace pas un test fonctionnel de mutation.</p>
<div class="scroll"><table><thead><tr><th>Largeur</th><th>Cas passés</th><th>Échecs restants</th></tr></thead><tbody>{''.join(navigation)}</tbody></table></div>
<p>Les inspections approfondies ont produit 131 cas bureau et 125 cas mobile. Leurs échecs sont conservés : certains correspondent au redémarrage du serveur pendant l’exécution, d’autres à une assertion de titre sur une page d’erreur. Ils nécessitent un recontrôle avant toute clôture exhaustive.</p>
<h2>Qualité du code et tests automatisés</h2>
<ul><li>Intégration : 1 334 tests passent dans la commande globale, puis 18 tests complémentaires (import, approbations et SEO). Bases SQLite, PostgreSQL, MySQL/MariaDB réellement utilisées. Redis/S3 et Stripe restent sautés quand non configurés.</li>
<li>Unitaires globaux : 5 153 assertions passent, quatre échouent dans la première exécution ; elle ne termine donc pas tout le workspace. Les quatre cas sont recontrôlés après mise à jour des attentes de traduction et de niveau de titre. Le résultat ciblé ne remplace pas une nouvelle exécution globale.</li>
<li>Playwright : trois parcours métier passent sur Chromium bureau : formulaire conditionnel multipart, relecture éditoriale, validation/refus d’une mutation MCP réelle. Le harness permet également navigation bureau/mobile et sécurité Firefox/WebKit. La campagne complète n’a pas été terminée.</li>
<li>Les Changesets et la documentation des contrats concernés sont présents. Aucun nouveau fournisseur d’infrastructure obligatoire n’a été introduit.</li></ul>
{gate_html}
<h2>Défauts et risques restant à traiter</h2>
<ol><li><strong>Menus à 390 px :</strong> actions Modifier/Supprimer trop larges, débordement jusqu’à 413 px.</li>
<li><strong>Profil à 320 px :</strong> débordement jusqu’à 386 px.</li>
<li><strong>Textes de l’assistant :</strong> descriptions d’outils en anglais sur l’interface française, observées visuellement.</li>
<li><strong>Dépendance résiduelle :</strong> <code>http-cache-semantics@4.2.0</code>, avis haut sans version corrigée. La preuve locale conclut que le chemin d’exploitation n’est pas atteint dans le consommateur Astro examiné ; la dépendance reste vulnérable. <a href="http-cache-semantics.md">Analyse détaillée</a>.</li>
<li><strong>Performance :</strong> comparaison Lighthouse dédiée avant/après à achever ; aucune garantie de non-régression émise.</li>
<li><strong>Dette serveur :</strong> assemblage partagé extrait, mais le très grand fichier <code>serve.ts</code> demeure.</li>
<li><strong>Recette non achevée :</strong> relancer la suite globale et l’ensemble des E2E officiels, puis les scénarios interrompus ou reposant sur d’anciennes fixtures. WordPress incompatible est maintenant refusé correctement : un parcours d’import sur cible compatible doit compléter ce refus.</li>
<li><strong>Services externes :</strong> paiement sandbox, Redis/S3 et connexions externes non configurées ne sont pas couverts par une validation locale réussie.</li></ol>
<h2>Captures de preuve</h2><p>Images intégrées au fichier HTML. Les liens ouvrent les originaux locaux. Ces captures montrent aussi les défauts restant ouverts.</p><div class="gallery">{''.join(figures)}</div>
<h2>Suivi des 43 constats initiaux</h2><p>« Implémenté, validation partielle » distingue le code corrigé d’une recette exhaustive. Les détails décrivent le changement apporté et ses limites.</p>{''.join(cards)}
<h2>Comparaison avec les CMS populaires</h2>
<p>Comparaison documentaire, pas une prétendue campagne exécutée sur WordPress, Drupal ou Strapi. WordPress fournit une référence pour les <a href="https://wordpress.org/documentation/article/roles-and-capabilities/">rôles et capacités</a> et la <a href="https://wordpress.org/documentation/article/media-library-screen/">gestion des médias</a>. Drupal formalise les <a href="https://www.drupal.org/docs/8/core/modules/workflows/overview">workflows et transitions</a>. Strapi documente <a href="https://docs.strapi.io/cms/features/draft-and-publish">Draft &amp; Publish</a> et les <a href="https://docs.strapi.io/cms/features/review-workflows">Review Workflows</a>.</p>
<p>Les corrections de Cogenta rapprochent ces parcours des attentes courantes : contrôle d’accès cohérent, états éditoriaux compréhensibles, édition persistante et opérations réversibles. La maturité de production exige encore les validations restantes ; la présence d’un runtime agentique ne les remplace pas.</p>
<h2>Suite proposée, à la décision de l’utilisateur</h2>
<p>Priorité 1 : fermer les deux débordements et les textes IA. Priorité 2 : achever la recette globale et les scénarios interrompus. Priorité 3 : mesures Lighthouse et services externes disponibles. La fusion sur <code>main</code> reste suspendue à cette validation.</p>
<p class="muted">Rapport généré à partir des preuves locales : {escape(datetime.now().astimezone().isoformat(timespec='seconds'))}. <a href="tracking.json">Suivi JSON</a> · <a href="regression/ai-real-provider-summary.md">Détail IA</a> · <a href="../audit-2026-10-03/">Archives de l’audit initial</a>.</p>
</main></html>'''
    (HERE / 'rapport-etape.html').write_text(body)


if __name__ == '__main__':
    build()
