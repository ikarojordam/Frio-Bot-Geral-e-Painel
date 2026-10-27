/**
 * FrioBot / ORG RAID — entrada única para Render Web Service.
 * O sistema de apostas já inicia seu servidor HTTP em lib/launch.js.
 * Não inicie outro cliente Discord nem outro servidor na mesma porta.
 */
'use strict';
require('dotenv').config();
process.env.HOST = '0.0.0.0';
require('./apostas.js');
