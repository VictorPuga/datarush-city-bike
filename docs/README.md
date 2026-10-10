# Docs

Notes on the processes behind the data and the dashboard.
Each page covers one process: what it does, how to run it, and what it produces.

| Page | Covers |
| --- | --- |
| [stations.md](stations.md) | Deriving `stations.json` from raw trip files |
| [regions.md](regions.md) | Assigning stations to NTA regions |
| [nta-dataset.md](nta-dataset.md) | The NYC Neighborhood Tabulation Areas dataset |
| [inference.md](inference.md) | Serving the ONNX model through `/api/inference` |
| [dashboard.md](dashboard.md) | How the UI uses stations and regions |
| [ml-data.md](ml-data.md) | Building the training tables from the raw trip files |
| [evaluation.md](evaluation.md) | The fixed model evaluation protocol and its results |

Add a new page here when a new process is introduced, and link it in the table.
