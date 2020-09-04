'use strict';

const express = require('express');
const config = require('./config');
const mongoose = require('mongoose');

const { db: { host, port, name } } = config;
const connectionString = `mongodb://${host}:${port}/${name}`;
mongoose.connect(connectionString, {useNewUrlParser: true, useUnifiedTopology: true});

const Cat = mongoose.model('Cat', { name: String });

const kitty = new Cat({ name: 'Cutie' });
kitty.save().then(() => console.log('Database connection and insert was successful'));

// Constants
const PORT = 8080;
const HOST = '0.0.0.0';
console.log(process.env);

// App
const app = express();
app.get('/', (req, res) => {
  res.send("<b>Hostname: </b>"+process.env.HOSTNAME);
});

app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);
