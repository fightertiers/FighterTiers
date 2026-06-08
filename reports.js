
import {
  db,
  collection,
  addDoc
} from './firebase.js';

const form = document.getElementById('reportForm');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  await addDoc(collection(db, 'reports'), {
    reporter: document.getElementById('reporter').value,
    hacker: document.getElementById('hacker').value,
    server: document.getElementById('server').value,
    evidence: document.getElementById('evidence').value,
    notes: document.getElementById('notes').value,
    created: Date.now()
  });

  alert('Report submitted');
});
