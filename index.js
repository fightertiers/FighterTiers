require('dotenv').config({ path: '../.env' });
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require('discord.js');

const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const PREFIX = '!';
const RESULTS_CHANNEL_NAME = 'results';

// =====================
// FILE HELPERS
// =====================

function loadJSON(file, fallback) {
  if (!fs.existsSync(file)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2)
  );
}

const { exec } = require('child_process');

async function runGitCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return reject(error);
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      resolve(stdout);
    });
  });
}

async function saveJSONToGitHub(filePath, data, commitMessage) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  try {
    await runGitCommand(`git add ${filePath}`);
    await runGitCommand(`git commit -m "${commitMessage}"`)
    // This assumes the remote name is 'origin' and the branch is 'main' or 'master'
    // You might need to adjust this based on your repository setup
    await runGitCommand(`git push https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`);
    console.log(`Successfully pushed ${filePath} to GitHub.`);
  } catch (error) {
    console.error(`Error pushing ${filePath} to GitHub:`, error);
  }
}

// =====================
// ROLE MANAGEMENT
// =====================

async function manageRoles(member, tierKey) {
  const guild = member.guild;
  const allRoles = await guild.roles.fetch();

  console.log(`manageRoles called for member: ${member.user.tag}, tierKey: ${tierKey}`);

  const currentPlaneName = planes[tierKey];
  console.log(`Derived currentPlaneName: ${currentPlaneName}`);

  const targetRoleName = `${tierKey}-${currentPlaneName}`;
  console.log(`Target Role Name: ${targetRoleName}`);

  // Remove existing tier-plane roles
  for (const [key, planeName] of Object.entries(planes)) {
    const roleName = `${key}-${planeName}`;
    const role = allRoles.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (role && member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      console.log(`Removed role ${role.name} from ${member.user.tag}`);
    }
  }

  // Add new tier-plane role
  const newRole = allRoles.find(r => r.name.toLowerCase() === targetRoleName.toLowerCase());
  if (newRole) {
    await member.roles.add(newRole);
    console.log(`Added role ${newRole.name} to ${member.user.tag}`);
  } else {
    console.log(`Role for plane ${targetRoleName} not found.`);
  }
}

// =====================
// DATA
// =====================

let testers = new Set(
  loadJSON('../testers.json', [])
);

let queue = loadJSON('../queue.json', {
  open: false,
  tester: '',
  region: 'NA',
  rounds: 3,
  players: [],
  current: null
});

// =====================
// PLANES
// =====================

const planes = loadJSON('../tiers.json', {});

let validTiers = [];

// =====================
// READY
// =====================

client.once('clientReady', async () => {
  console.log(
    `Logged in as ${client.user.tag}`
  );
  // Ensure validTiers is populated after planes is loaded
  validTiers = Object.keys(planes);
});

// =====================
// MESSAGE SYSTEM
// =====================

client.on('messageCreate', async (message) => {

  if (message.author.bot) return;

  // =====================
  // TEST CHANNEL TIER ENTRY
  // =====================

  const tierMessage =
    message.content.toLowerCase();

  if (
    validTiers.includes(tierMessage) &&
    message.channel.name &&
    message.channel.name.startsWith('test-') &&
    testers.has(message.author.id)
  ) {

    const player = queue.current;

    if (!player) return;

    const players = loadJSON(
      '../players.json',
      {}
    );

    players[player.id] = {
      username: player.username,
      tier: tierMessage.toUpperCase(),
      plane: planes[tierMessage],
      rounds: 3,
      testedBy: message.author.username,
      testedAt: new Date().toISOString()
    };

    saveJSONToGitHub('../players.json', players, `Updated player data for ${player.username}`);

    // Manage player roles
    const guildMember = await message.guild.members.fetch(player.id);
    if (guildMember) {
      await manageRoles(guildMember, tierMessage);
    }

    const resultsChannel =
      message.guild.channels.cache.find(
        c => c.name === RESULTS_CHANNEL_NAME
      );

    if (resultsChannel) {

      await resultsChannel.send(
        `🏆 ${player.username} achieved ${tierMessage.toUpperCase()} (${planes[tierMessage]})`
      );

    }

    await message.channel.send(
      `📊 RESULT SAVED\n\nPlayer: ${player.username}\nTier: ${tierMessage.toUpperCase()}\nPlane: ${planes[tierMessage]}`
    );

    queue.current = null;

    saveJSONToGitHub('../queue.json', queue, 'Queue data updated');

    setTimeout(async () => {

      try {
        await message.channel.delete();
      } catch {}

    }, 3000);

    return;
  }

  if (!message.content.startsWith(PREFIX))
    return;

  const args = message.content
    .slice(PREFIX.length)
    .trim()
    .split(/ +/);

  const command =
    args.shift().toLowerCase();

  if (command === 'test') {
    return message.reply(
      '✈️ Fighter Tiers Bot Online'
    );
  }

  if (command === 'tiers') {

    let text = '';

    for (const [tier, plane] of Object.entries(planes)) {

      text +=
        `${tier.toUpperCase()} → ${plane}\n`;

    }

    return message.reply(text);
  }

  if (command === 'maketester') {

    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      return message.reply(
        'Admin only.'
      );
    }

    const user =
      message.mentions.users.first();

    if (!user) {
      return message.reply(
        'Usage: !maketester @user'
      );
    }

    testers.add(user.id);

    saveJSONToGitHub(
      '../testers.json',
      [...testers],
      `Tester ${user.username} added`
    );

    return message.reply(
      `${user.username} is now a Tester`
    );
  }

  if (command === 'openqueue') {

    if (!testers.has(message.author.id)) {
      return message.reply(
        'Tester only.'
      );
    }

    queue = {
      open: true,
      tester: message.author.username,
      region: args[0] || 'NA',
      rounds: 3,
      players: [],
      current: null
    };

    saveJSONToGitHub('../queue.json', queue, `Queue opened by ${message.author.username}`);

    const row =
      new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId('join_queue')
            .setLabel('Join Queue')
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId('leave_queue')
            .setLabel('Leave Queue')
            .setStyle(ButtonStyle.Danger),

          new ButtonBuilder()
            .setCustomId('next_player')
            .setLabel('Next Player')
            .setStyle(ButtonStyle.Primary)

        );

    return message.channel.send({
      content:
`🟢 QUEUE OPEN

Tester: ${queue.tester}
Region: ${queue.region}
Rounds: 3`,
      components: [row]
    });
  }
  if (command === 'closequeue') {

    if (!testers.has(message.author.id)) {
      return message.reply(
        'Tester only.'
      );
    }

    queue.open = false;
    queue.players = [];
    queue.current = null;

    saveJSONToGitHub('../queue.json', queue, `Queue closed by ${message.author.username}`);

    return message.reply(
      '🔴 Queue closed'
    );
  }

  if (command === 'profile') {

    const players =
      loadJSON('../players.json', {});

    const profile =
      players[message.author.id];

    if (!profile) {

      return message.reply(
        'No profile found.'
      );

    }

    return message.reply(
`✈️ ${profile.username}

Tier: ${profile.tier}
Plane: ${profile.plane}
Rounds: ${profile.rounds || 3}`
    );
  }

  if (command === 'queue') {

    return message.reply(
`Queue Open: ${queue.open}
Players Waiting: ${queue.players.length}
Current Player: ${
  queue.current
    ? queue.current.username
    : 'None'
}`
    );
  }

});

// =====================
// BUTTON SYSTEM
// =====================

client.on(
  'interactionCreate',
  async interaction => {

    if (!interaction.isButton())
      return;

    // =====================
    // JOIN QUEUE
    // =====================

    if (
      interaction.customId ===
      'join_queue'
    ) {

      if (!queue.open) {

        return interaction.reply({
          content:
            'Queue is closed.',
          flags: 64
        });

      }

      if (
        queue.players.find(
          p =>
            p.id ===
            interaction.user.id
        )
      ) {

        return interaction.reply({
          content:
            'Already queued.',
          flags: 64
        });

      }

      queue.players.push({
        id: interaction.user.id,
        username:
          interaction.user.username
      });

      saveJSONToGitHub(
        '../queue.json',
        queue,
        `Player ${interaction.user.username} joined queue`
      );

      return interaction.reply({
        content:
          `Joined queue (#${queue.players.length})`,
        flags: 64
      });
    }

    // =====================
    // LEAVE QUEUE
    // =====================

    if (
      interaction.customId ===
      'leave_queue'
    ) {

      queue.players =
        queue.players.filter(
          p =>
            p.id !==
            interaction.user.id
        );

      saveJSONToGitHub(
        '../queue.json',
        queue,
        `Player ${interaction.user.username} left queue`
      );

      return interaction.reply({
        content:
          'Left queue.',
        flags: 64
      });
    }

    // =====================
    // NEXT PLAYER
    // =====================

    if (
      interaction.customId ===
      'next_player'
    ) {

      if (
        !testers.has(
          interaction.user.id
        )
      ) {

        return interaction.reply({
          content:
            'Tester only.',
          flags: 64
        });

      }

      const next =
        queue.players.shift();

      if (!next) {

        return interaction.reply({
          content:
            'Queue empty.',
          flags: 64
        });

      }

      queue.current = next;

      saveJSONToGitHub(
        '../queue.json',
        queue,
        `Next player ${next.username} selected`
      );

      const guild =
        interaction.guild;

      const channel =
        await guild.channels.create({
          name:
            `test-${next.username}`,
          type:
            ChannelType.GuildText,
          permissionOverwrites: [
            {
              id:
                guild.roles.everyone.id,
              deny: [
                'ViewChannel'
              ]
            },
            {
              id:
                interaction.client.user.id,
              allow: [
                'ViewChannel',
                'SendMessages',
                'ReadMessageHistory'
              ]
            },
            {
              id:
                interaction.user.id,
              allow: [
                'ViewChannel',
                'SendMessages',
                'ReadMessageHistory'
              ]
            },
            {
              id: next.id,
              allow: [
                'ViewChannel',
                'SendMessages',
                'ReadMessageHistory'
              ]
            }
          ]
        });

      await channel.send(
`✈️ TEST STARTED

Tester:
<@${interaction.user.id}>

Player:
<@${next.id}>

Rounds: 3

When finished, the tester types:

HT1
LT1
HT2
LT2
HT3
LT3
HT4
LT4
HT5
LT5

The bot will save the result,
post it in #results,
update the website data,
and delete this channel.`
      );

      return interaction.reply({
        content:
          `Created test room: ${channel}`,
        flags: 64
      });
    }

  }
);

// =====================
// LOGIN
// =====================

 client.login(process.env.DISCORD_TOKEN);
