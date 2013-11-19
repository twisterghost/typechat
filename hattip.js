/*
 * HatTip - Simple and elegant link sharing.
 */

console.log("Starting up. Gimmie a sec...");

// Imports and dependencies.
var express = require("express");
var argv = require("optimist").argv;
var app = express();
var logger = require("winston");
var server = require("http").createServer(app);
var io = require('socket.io').listen(server);
var fs = require("fs");
var _ = require("underscore");


// Set up and defaults.
var port = argv.port || process.env.PORT || 4488;
var topic = argv.topic || "Hat Tip";
var postMemory = [];
var urlPattern = /(http|ftp|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/;

logger.info("Runnin' on port " + port);

// Set app to use jade.
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');

// Set static directory.
app.use(express.static(__dirname + '/public'));

// Handle favicon requests. Ain't got one for now.
app.get("/favicon.ico", function(req, res) {
  res.send("nope", 404);
});


// Handle favicon requests. Ain't got one for now.
app.get("/help", function(req, res) {
  res.render("help");
});

// Default to index.
app.get("/", function(req, res) {
  res.render("index", {topic: topic});
});

// Begin socket handling.
io.sockets.on('connection', function (socket) {

  var room = "home";
  socket.join("home");

  // On a connection, send the user the posts in memory.
  // TODO: Add a limiter so we aren't sending thousands of posts at once.

  socket.on("getMemory", function(data) {
    var sendPosts = [];
    for (var post in postMemory) {
      if (postMemory[post].room == data.room) {
        sendPosts.push(postMemory[post]);
      }
    }
    socket.emit("postMemory", {posts: sendPosts});
  });
  

  // When a user connects, name this connection and send an ack.
  socket.on("connect", function(data) {
    console.log("Connected: " + data.username);
    socket.set("username", fixName(data.username.trim()), function() {
      socket.emit("connect-ack");
    });
  });

  // When a user sends a message, parse it.
  socket.on("send", function(data) {
    console.log("Message sent by " + data.username);
    parseMessage(data, socket);
  })
});

// Parses messages and responds to the client.
function parseMessage(data, socket) {

  var post = {
    type: "",
    content: "",
    author: data.username,
    time: new Date().getTime() / 1000,
    room: data.room
  }

  if (data.message.trim()[0] == "!") {

    // This is a user made comment.
    // First, try to figure out if it is about an older link.

    var firstSegment = data.message.trim().split(" ")[0];
    if (firstSegment.match(/\!\-[0-9]+/)) {
      var lookback = firstSegment.match(/[0-9]+/)[0];
      data.message = data.message.replace(/\!\-[0-9]+/, "!");
    }

    post.lookback = lookback;
    post.type = "comment";
    post.content = _.escape(data.message.trim().substring(1).trim());
    postMemory.push(post);

  } else if (data.message.trim()[0] == "@") {

    // This is a name change.
    post.type = "namechange";
    var newName = fixName(data.message.trim().substring(1));
    post.author += " -> " + newName;
    post.content = data.username + " has changed their name to " + newName;
    postMemory.push(post);

    socket.emit("namechange", {newName: newName});

  } else if (data.message.trim()[0] == "#") {
    //setEnterAction("Search for '" + data.message.trim().substring(1).trim() + "'");
  } else if (data.message.trim()[0] == ">") {
    // This is a link.
    post.type = "text";
    post.content = _.escape(data.message.trim().substring(1).trim());
    postMemory.push(post);
  } else if (data.message.trim().match(urlPattern) !== null) {

    // This is a link.
    post.type = "link";
    post.content = data.message.trim();
    postMemory.push(post);

  } else if (data.message.trim()[0] == "/") {

    // Change room.
    var newroom = _.escape(data.message.trim().substring(1).trim());
    if (newroom == "") {
      newroom = "home";
    }
    socket.leave(data.room);
    socket.join(newroom);
    console.log(data.username + " joined " + newroom);
    console.log(io.sockets.manager.roomClients[socket.id]);
    socket.emit("roomchange", {room: newroom});

  }else {
    socket.emit("unknown");
    return;
  }

  socket.emit("new", post);
  socket.broadcast.to(data.room).emit("new", post);
  saveData();
}


function saveData() {
  fs.writeFileSync("memory", JSON.stringify(postMemory));
}

function loadData() {
  if (fs.existsSync("memory")) {
    postMemory = JSON.parse(fs.readFileSync("memory"));
  }
}

function sanitize(string) {
  return _.escape(string.trim());
}

function fixName(string) {
  string = sanitize(string);
  return string.substring(0, 30);
}

// Set socket.io's log level. Change to 3 to see debug info.
io.set("log level", 2);

// Load up the server memory, if any.
loadData();

// Start listening.
server.listen(port);
