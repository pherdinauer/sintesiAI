console.log('Avvio del server...');
require('dotenv').config();
console.log('Configurazione dotenv completata');
const express = require('express');
console.log('Express importato');
const multer = require('multer');
console.log('Multer importato');
const upload = multer({ storage: multer.memoryStorage() });
console.log('Upload configurato');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const docx = require('docx');
const HTMLtoDOCX = require('html-to-docx');

console.log('Tutti i moduli importati');

const app = express();
console.log('Applicazione Express creata');

// Aggiungi il middleware per il parsing del JSON
app.use(express.json());

// Oggetto per tenere traccia dello stato del processo
let processStatus = {
  currentStep: '',
  progress: 0
};

// Funzione per aggiornare lo stato del processo
function updateProcessStatus(step, progress) {
  processStatus.currentStep = step;
  processStatus.progress = progress;
  console.log(`Stato del processo: ${step} - Progresso: ${progress}%`);
}

// Endpoint per ottenere lo stato del processo
app.get('/api/process-status', (req, res) => {
  res.json(processStatus);
});

// Definizione dei prompt
const PROMPTS = {
  CLAUDE_PROMPT_1: ` <html>
  <body>
  <h1>PARTE 1 - Informazioni generali e metadati</h1>
  
  <p>Analizza il documento fornito e estrai le seguenti informazioni in formato HTML:</p>
  
  <h2>Informazioni Generali</h2>
  <p><strong>File di input:</strong> [Nome del file di input]</p>
  <p><strong>File prompt:</strong> [Nome del file prompt]</p>
  <p><strong>Data e ora:</strong> [Data e ora attuale nel formato DD/MM/YYYY HH:MM]</p>
  <p><strong>Modello:</strong> [Claude 3.5]</p>
  
  <h3>Commessa</h3>
  <p><strong>Titolo:</strong> [Titolo completo del progetto]</p>
  <p><strong>ID Commessa:</strong> [ID Commessa, se specificato; altrimenti usa "1"]</p>
  <p><strong>Committente:</strong> [Nome del committente]</p>
  <p><strong>Importo:</strong> [Importo in euro, senza decimali] € [Cercalo nel documento] [Se non specificato, indica "Non specificato"]</p>
  <p><strong>Durata:</strong> [Durata in mesi] mesi</p>
  
  <h4>Obiettivo</h4>
  <p>[Descrizione dettagliata dell'obiettivo principale del progetto]</p>
  
  <h2>Istruzioni Aggiuntive</h2>
  <ul>
    <li>Assicurati di compilare tutti i campi con le informazioni appropriate dal documento</li>
    <li>Utilizza il formato HTML corretto</li>
    <li>Se alcune informazioni non sono esplicitamente menzionate, usa "Non specificato"</li>
    <li>Traduci tutto in italiano se necessario</li>
  </ul>
  
  </body>
  </html>`,

  CLAUDE_PROMPT_2: `PARTE 2 - Attività e prodotti: 
Analizza il documento fornito e crea le seguenti tabelle in formato HTML: 
<h2>Attività Richieste</h2> 
<table style="width:100%; border-collapse: collapse; margin-bottom: 20px;"> 
<thead> 
  <tr style="background-color: #f2f2f2;"> 
    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Linea</th> 
    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">ID Attività</th> 
    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Descrizione Attività</th> 
  </tr> 
</thead> 
<tbody> 
  [Inserisci righe della tabella qui] 
</tbody> 
</table> 
 
<h2>Prodotti Richiesti</h2> 
<table style="width:100%; border-collapse: collapse; margin-bottom: 20px;"> 
<thead> 
  <tr style="background-color: #f2f2f2;"> 
    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">ID</th> 
    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Descrizione Prodotto</th> 
    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Qtà</th> 
  </tr> 
</thead> 
<tbody> 
  [Inserisci righe della tabella qui] 
</tbody> 
</table> 
Istruzioni per la tabella delle Attività: 
 
La "Linea" rappresenta il Filone di Attività (livello di raggruppamento più alto) 
Assegna un ID progressivo a ciascuna attività (es. 1.1, 1.2, 2.1, 2.2) 
Fornisci una descrizione dettagliata di ogni attività 
 
Istruzioni per la tabella dei Prodotti: 
 
Usa l'ID dell'attività correlata se specificato, altrimenti usa un numero progressivo 
Fornisci una descrizione dettagliata di ogni prodotto 
Indica la quantità (usa 1 se non specificata) 
Includi TUTTI i prodotti elencati 
Non raggruppare i prodotti/work packages (WP) 
Tradurre tutto in italiano 
`,

  CLAUDE_PROMPT_3: `PARTE 3 - Gruppo di lavoro e risorse: 
Analizza il documento fornito e crea la seguente tabella in formato HTML, non troncare dati dalla tabella: 
<h2>Gruppo di Lavoro</h2> 
<table style="width:100%; border-collapse: collapse; margin-bottom: 20px;"> 
<thead> 
  <tr style="background-color: #f2f2f2;"> 
    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">ID</th> 
    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Profilo</th> 
    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Esp. Minima</th> 
    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Competenze</th> 
    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Qtà</th> 
    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">gg. Tot.</th> 
  </tr> 
</thead> 
<tbody> 
  [Inserisci righe della tabella qui] 
  <tr> 
    <td colspan="4" style="border: 1px solid #ddd; padding: 8px; text-align: right;"><strong>Totale:</strong></td> 
    <td style="border: 1px solid #ddd; padding: 8px; text-align: left;">[Totale Qtà]</td> 
    <td style="border: 1px solid #ddd; padding: 8px; text-align: left;">[Totale gg.]</td> 
  </tr> 
</tbody> 
</table> 
Istruzioni per la tabella del Gruppo di Lavoro: 
 
Assegna un ID progressivo a ciascun profilo 
Descrivi dettagliatamente il ruolo/profilo richiesto 
Indica gli anni di esperienza minima (0 se non specificata) 
Elenca tutte le competenze richieste in dettaglio 
Indica la quantità richiesta (0 se non specificata) 
Indica il totale di giorni lavorativi (0 se non specificato) 
Aggiungi una riga "Totale:" alla fine della tabella con i totali delle colonne Qtà e gg. Tot. 
Se possibile, calcola e aggiungi il valore €/gg dividendo l'Importo totale per il totale dei giorni lavorativi 
 
<p>Valore €/gg: [Calcolo del valore €/gg se possibile]</p> 
Assicurati di: 
 
Non troncare i dati che potresti inserire nella tabella 
Mantenere tutti i dettagli forniti nel documento originale 
Tradurre tutto in italiano 
Usare un formato chiaro e dettagliato 
`,

/*  CLAUDE_PROMPT_FINAL: `Unisci le informazioni fornite nelle tre parti precedenti in un unico documento HTML coerente. Assicurati di:

1. Mantenere la struttura HTML fornita in ciascuna parte.
2. Integrare le informazioni in modo logico e fluido.
3. Non perdere alcuna informazione dalle parti precedenti.
4. Mantenere tutti i dettagli importanti di ciascuna parte.
5. Utilizzare un formato HTML valido e ben strutturato.
6. Includere tutti i calcoli e i totali richiesti.

Il documento HTML finale dovrebbe fornire una rappresentazione completa e dettagliata del progetto, incluse le informazioni generali, le attività, i prodotti, il gruppo di lavoro e i calcoli correlati.`*/
};

// Crea la cartella di output se non esiste
const outputFolder = path.join(__dirname, 'output');
try {
  fsSync.mkdirSync(outputFolder, { recursive: true });
  console.log('Cartella di output creata o già esistente');
} catch (error) {
  console.error('Errore nella creazione della cartella di output:', error);
}

async function summarizeWithClaude(text) {
  console.log('Inizio funzione summarizeWithClaude');
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const CLAUDE_MODEL = 'anthropic/claude-3-opus-20240229';

  console.log('Lunghezza del testo da sintetizzare:', text.length);

  function splitTextIntoChunks(text, chunkSize = 8000) {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }

  const textChunks = splitTextIntoChunks(text);
  let htmlContents = [];

  for (let i = 0; i < 3; i++) {
    updateProcessStatus(`Sintesi parte ${i + 1}`, 30 + (i + 1) * 10);
    const chunk = textChunks[i] || '';
    const promptKey = `CLAUDE_PROMPT_${i + 1}`;
    const prompt = `${PROMPTS[promptKey]}

    Analizza il seguente testo e fornisci una sintesi in formato HTML secondo le istruzioni sopra:

    ${chunk}

    Sintesi HTML:`;

    try {
      console.log(`Inizio chiamata API a OpenRouter per la Parte ${i + 1}`);
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: CLAUDE_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4000,
          temperature: 0.7,
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://tuodominio.com',
            'X-Title': 'Sintesi AI',
          },
        }
      );
      console.log(`Modello utilizzato: ${response.data.model}`);
      console.log(`Risposta ricevuta da OpenRouter per la Parte ${i + 1}`);
      console.log('Lunghezza della risposta:', response.data.choices[0].message.content.length);

      const htmlContent = response.data.choices[0].message.content;
      htmlContents.push(htmlContent);
      console.log(`Contenuto HTML ${i + 1} salvato`);

    } catch (error) {
      console.error(`Errore durante la chiamata a Claude per la Parte ${i + 1}:`, error.message);
      htmlContents.push(`<h2>Errore</h2><p>Errore nell'elaborazione della Parte ${i + 1}: ${error.message}</p>`);
    }
  }

  // Unisci i contenuti HTML
  const combinedHtml = htmlContents.join('\n');

  console.log('HTML combinato:', combinedHtml);

  // Crea il documento HTML completo
  const fullHtmlContent = `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sintesi del Progetto</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        h1, h2 { color: #2c3e50; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>Sintesi del Progetto</h1>
    ${combinedHtml}
</body>
</html>
  `;

  console.log('Lunghezza dell\'HTML finale:', fullHtmlContent.length);
  return fullHtmlContent;
}

async function getUniqueFileName(basePath, fileName) {
  let counter = 1;
  let filePath = path.join(basePath, fileName);
  while (fsSync.existsSync(filePath)) {
    const { name, ext } = path.parse(fileName);
    fileName = `${name}_${counter}${ext}`;
    filePath = path.join(basePath, fileName);
    counter++;
  }
  return fileName;
}

app.post('/api/summarize', upload.single('pdf'), async (req, res) => {
  console.log('Richiesta ricevuta per /api/summarize');
  updateProcessStatus('Inizio elaborazione', 0);
  try {
    const originalFileName = path.parse(req.file.originalname).name;
    updateProcessStatus('Parsing del PDF', 10);
    console.log('Inizio parsing del PDF');
    const pdfData = await pdfParse(req.file.buffer);
    const text = pdfData.text;
    console.log('Parsing del PDF completato. Lunghezza del testo:', text.length);

    updateProcessStatus('Sintesi con Claude', 30);
    console.log('Inizio chiamata a Claude per la sintesi');
    const htmlSummary = await summarizeWithClaude(text);
    console.log('Sintesi HTML completata. Lunghezza della sintesi:', htmlSummary.length);

    updateProcessStatus('Salvataggio file HTML', 70);
    // Salva il file HTML
    let htmlFileName = `${originalFileName}_sintesi.html`;
    htmlFileName = await getUniqueFileName(outputFolder, htmlFileName);
    const htmlFilePath = path.join(outputFolder, htmlFileName);
    await fs.writeFile(htmlFilePath, htmlSummary);

    updateProcessStatus('Conversione in DOCX', 80);
    // Converti HTML in DOCX
    const docxBuffer = await HTMLtoDOCX(htmlSummary, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
    });

    updateProcessStatus('Salvataggio file DOCX', 90);
    // Salva il file DOCX
    let docxFileName = `${originalFileName}_sintesi.docx`;
    docxFileName = await getUniqueFileName(outputFolder, docxFileName);
    const docxFilePath = path.join(outputFolder, docxFileName);
    await fs.writeFile(docxFilePath, docxBuffer);

    updateProcessStatus('Elaborazione completata', 100);
    res.json({ htmlFileName, docxFileName });
  } catch (error) {
    console.error('Errore durante l\'elaborazione del PDF:', error);
    updateProcessStatus('Errore durante l\'elaborazione', 0);
    res.status(500).json({ error: 'Errore durante l\'elaborazione del PDF' });
  }
});

app.get('/api/download/html/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'output', filename);
  res.download(filePath, (err) => {
    if (err) {
      console.error('Errore nel download del file HTML:', err);
      res.status(404).send('File non trovato');
    }
  });
});

app.get('/api/download/docx/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'output', filename);
  res.download(filePath, (err) => {
    if (err) {
      console.error('Errore nel download del file DOCX:', err);
      res.status(404).send('File non trovato');
    }
  });
});

const PORT = process.env.PORT || 3000;
console.log('Porta configurata:', PORT);
app.listen(PORT, () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
});