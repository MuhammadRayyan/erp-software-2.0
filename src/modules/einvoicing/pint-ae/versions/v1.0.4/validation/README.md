# PINT-AE 1.0.4 validation assets

These files are the official OpenPeppol PINT-AE 1.0.4 validation stylesheets and
their Saxon-JS executable forms. The source archive was downloaded from:

`https://docs.peppol.eu/poac/ae/upcoming/pint-ae/resources.zip`

The two source stylesheets came from `trn-invoice/schematron/`. The invoice and
credit-note resources publish byte-identical copies, so one audited copy is used
for both UBL document roots.

| File | SHA-256 |
| --- | --- |
| `PINT-UBL-validation-preprocessed.xslt` | `b6557c207f1ccaebf32b67ae0d50b309192751b58ddd22fa5af90c6d45f7d16` |
| `PINT-jurisdiction-aligned-rules.xslt` | `da931f161362fe26bb9f5a1e519cd44758e5cba977584800b806c09bcf1b807b` |
| `pint-ubl.sef.json` | `0171d72496664c6ee00daf616c3d6f22774f8e215eb939265b001bd0cef35c1b` |
| `pint-ae.sef.json` | `8c418c092bc057cc27e977a5796cc64565c47ba66346dce04b9f9d7e56d03c67` |

The SEF files were compiled with `xslt3` 2.7.0 using `-nogo -relocate:on`.
They are data artifacts, not handwritten substitutes for the official rules.
