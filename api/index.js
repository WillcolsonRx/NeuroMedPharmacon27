// Vercel Serverless Function entry point
// Forwards incoming requests to the Express application
const { app } = require('../server');

module.exports = app;
