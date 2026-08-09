# Activer la synchronisation automatique du CA (option 2)

Aujourd'hui, le CA Yango est synchronise **quand vous ouvrez Pilote**, au
maximum une fois par quart d'heure. Cela suffit les jours ouvres, mais si
personne n'ouvre l'application — un dimanche, un jour ferie — le CA reste fige
et les chauffeurs ne voient pas leur progression avancer.

L'option 2 confie ce declenchement a un serveur, qui appelle la
synchronisation meme quand personne n'est connecte.

## Pourquoi ce n'est pas deja fait

Le plan **Vercel Hobby** ne permet qu'**un seul passage par jour**. Pour un
objectif quotidien, un CA mis a jour une fois par jour n'a aucun interet : les
chauffeurs verraient toujours celui de la veille.

Il faut donc le plan **Pro**, environ **20 $ par mois**.

## Ce qu'il faudra faire une fois l'abonnement pris

### 1. Ajouter la tache planifiee dans `vercel.json`

```json
"crons": [
  { "path": "/api/yango?action=sync-ca", "schedule": "0 6-23 * * *" }
]
```

Un passage par heure entre 6 h et 23 h — inutile de tourner la nuit, la plage
de service s'arretant a minuit.

### 2. Ouvrir un acces pour la tache planifiee

`sync-ca` exige aujourd'hui un jeton d'utilisateur connecte (`verifyAuth`).
Une tache planifiee n'en a pas. Il faut donc accepter, **en plus**, un secret
partage :

- creer une variable d'environnement `CRON_SECRET` sur Vercel ;
- dans `handleSyncCa`, accepter la requete si l'en-tete `Authorization`
  correspond a ce secret, **en plus** du controle par jeton existant ;
- Vercel envoie automatiquement cet en-tete aux taches planifiees.

Cet acces n'a volontairement **pas** ete ajoute a l'avance : un chemin
d'authentification par secret qui dort dans le code, sans etre utilise ni
surveille, est une surface d'attaque inutile.

### 3. Verifier

Apres le premier passage, la table `fleet_ca_jour` doit contenir une ligne par
chauffeur ayant roule, avec `maj_le` recent :

```sql
select chauffeur_id, date, ca_brut, commission_yango, nb_courses, maj_le
from fleet_ca_jour order by maj_le desc limit 10;
```

## En attendant

Le declenchement au chargement de Pilote reste actif et suffit largement du
lundi au samedi. Il continuera de fonctionner apres l'activation de la tache
planifiee : les deux se completent sans se gener, l'ecriture etant idempotente
(meme identifiant `CA-<chauffeur>-<date>`, upsert sur `(chauffeur_id, date)`).
