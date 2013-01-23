var express = require("express");
var argv = require("optimist").argv;
var app = express();
var logger = require("winston");
var socket = require("socket.io");
var http = require("http");

logger.info("Welcome to Hat Tip!");

// Set up and defaults.

var port = varDefault(argv.port, process.env.PORT || 4488);
var topic = varDefault(argv.topic, "Hat Tip");
var links = [];

logger.info("Using ports: " + port + " and " + (port + 1));
logger.info("Using topic: " + topic);


// Routing.
app.get("/", function(req, res) {
  res.render("index.jade", {topic: topic}, function(err, html) {
    if (err) {
      logger.error(err);
      process.exit(1);
    }
    res.send(html);
  });
});

app.get("/js/hattip-client.js", function(req, res) {
  res.sendfile("js/hattip-client.js");
});

app.listen(port);
socket.listen(port + 1);

// Helper functions.
function varDefault(variable, defaultValue) {
  return typeof(variable) !== 'undefined' ? variable : defaultValue;
}