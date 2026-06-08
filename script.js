import {
  db,
  collection,
  onSnapshot
} from './firebase.js';

const leaderboard = document.getElementById('leaderboard');
const queueStatus = document.getElementById('queueStatus');
const search = document.getElementById('search');

let players = [];

onSnapshot(collection(db, 'players'), (snapshot) => {
  players = [];

  snapshot.forEach((doc) => {
    players.push(doc.data());
  });

  renderPlayers(players);
});

onSnapshot(collection(db, 'queue'), (snapshot) => {
  snapshot.forEach((doc) => {
    const data = doc.data();

    queueStatus.innerHTML = `
      <div class="queue-card">
        <h3>${data.open ? '🟢 OPEN' : '🔴 CLOSED'}</h3>
        <p>Tester: ${data.tester}</p>
        <p>Region: ${data.region}</p>
      </div>
    `;
  });
});

function renderPlayers(list) {
  leaderboard.innerHTML = '';

  list.forEach((player) => {
    leaderboard.innerHTML += `
      <div class="player-card">
        <h2>${player.username}</h2>
        <p>${player.tier}</p>
        <p>${player.plane}</p>
      </div>
    `;
  });
}

search.addEventListener('input', () => {
  const value = search.value.toLowerCase();

  const filtered = players.filter((p) =>
    p.username.toLowerCase().includes(value)
  );

  renderPlayers(filtered);
});
