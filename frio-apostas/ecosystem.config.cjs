// Gerado por scripts/generate-ecosystem.js — 10 worker(s). Segredos ficam no .env / variáveis do host.
module.exports = {
  "apps": [
    {
      "name": "frio-fleet-w0",
      "script": "./fleet.js",
      "exec_mode": "fork",
      "instances": 1,
      "node_args": "--max-old-space-size=1536",
      "env": {
        "WORKER_INDEX": "0",
        "WORKER_COUNT": "10",
        "PORT": "3000"
      },
      "autorestart": true,
      "max_restarts": 20,
      "restart_delay": 3000,
      "kill_timeout": 30000,
      "max_memory_restart": "1920M"
    },
    {
      "name": "frio-fleet-w1",
      "script": "./fleet.js",
      "exec_mode": "fork",
      "instances": 1,
      "node_args": "--max-old-space-size=1536",
      "env": {
        "WORKER_INDEX": "1",
        "WORKER_COUNT": "10",
        "PORT": "3001"
      },
      "autorestart": true,
      "max_restarts": 20,
      "restart_delay": 3000,
      "kill_timeout": 30000,
      "max_memory_restart": "1920M"
    },
    {
      "name": "frio-fleet-w2",
      "script": "./fleet.js",
      "exec_mode": "fork",
      "instances": 1,
      "node_args": "--max-old-space-size=1536",
      "env": {
        "WORKER_INDEX": "2",
        "WORKER_COUNT": "10",
        "PORT": "3002"
      },
      "autorestart": true,
      "max_restarts": 20,
      "restart_delay": 3000,
      "kill_timeout": 30000,
      "max_memory_restart": "1920M"
    },
    {
      "name": "frio-fleet-w3",
      "script": "./fleet.js",
      "exec_mode": "fork",
      "instances": 1,
      "node_args": "--max-old-space-size=1536",
      "env": {
        "WORKER_INDEX": "3",
        "WORKER_COUNT": "10",
        "PORT": "3003"
      },
      "autorestart": true,
      "max_restarts": 20,
      "restart_delay": 3000,
      "kill_timeout": 30000,
      "max_memory_restart": "1920M"
    },
    {
      "name": "frio-fleet-w4",
      "script": "./fleet.js",
      "exec_mode": "fork",
      "instances": 1,
      "node_args": "--max-old-space-size=1536",
      "env": {
        "WORKER_INDEX": "4",
        "WORKER_COUNT": "10",
        "PORT": "3004"
      },
      "autorestart": true,
      "max_restarts": 20,
      "restart_delay": 3000,
      "kill_timeout": 30000,
      "max_memory_restart": "1920M"
    },
    {
      "name": "frio-fleet-w5",
      "script": "./fleet.js",
      "exec_mode": "fork",
      "instances": 1,
      "node_args": "--max-old-space-size=1536",
      "env": {
        "WORKER_INDEX": "5",
        "WORKER_COUNT": "10",
        "PORT": "3005"
      },
      "autorestart": true,
      "max_restarts": 20,
      "restart_delay": 3000,
      "kill_timeout": 30000,
      "max_memory_restart": "1920M"
    },
    {
      "name": "frio-fleet-w6",
      "script": "./fleet.js",
      "exec_mode": "fork",
      "instances": 1,
      "node_args": "--max-old-space-size=1536",
      "env": {
        "WORKER_INDEX": "6",
        "WORKER_COUNT": "10",
        "PORT": "3006"
      },
      "autorestart": true,
      "max_restarts": 20,
      "restart_delay": 3000,
      "kill_timeout": 30000,
      "max_memory_restart": "1920M"
    },
    {
      "name": "frio-fleet-w7",
      "script": "./fleet.js",
      "exec_mode": "fork",
      "instances": 1,
      "node_args": "--max-old-space-size=1536",
      "env": {
        "WORKER_INDEX": "7",
        "WORKER_COUNT": "10",
        "PORT": "3007"
      },
      "autorestart": true,
      "max_restarts": 20,
      "restart_delay": 3000,
      "kill_timeout": 30000,
      "max_memory_restart": "1920M"
    },
    {
      "name": "frio-fleet-w8",
      "script": "./fleet.js",
      "exec_mode": "fork",
      "instances": 1,
      "node_args": "--max-old-space-size=1536",
      "env": {
        "WORKER_INDEX": "8",
        "WORKER_COUNT": "10",
        "PORT": "3008"
      },
      "autorestart": true,
      "max_restarts": 20,
      "restart_delay": 3000,
      "kill_timeout": 30000,
      "max_memory_restart": "1920M"
    },
    {
      "name": "frio-fleet-w9",
      "script": "./fleet.js",
      "exec_mode": "fork",
      "instances": 1,
      "node_args": "--max-old-space-size=1536",
      "env": {
        "WORKER_INDEX": "9",
        "WORKER_COUNT": "10",
        "PORT": "3009"
      },
      "autorestart": true,
      "max_restarts": 20,
      "restart_delay": 3000,
      "kill_timeout": 30000,
      "max_memory_restart": "1920M"
    }
  ]
};
