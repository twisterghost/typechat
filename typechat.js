/*
 * typechat - Simple and elegant link sharing.
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
var topic = argv.topic || "typechat";
var postMemory = [];
var urlPattern = /(http|ftp|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/;
var rooms = [];
var uid = 0;


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
  });

  socket.on("vote", function(data) {
    upvotePost(data.id);
  })
});

// Parses messages and responds to the client.
function parseMessage(data, socket) {
  var uid = new Date().getTime() + "-" + Math.floor(Math.random() * 1000);

  var post = {
    type: "",
    content: "",
    author: data.username,
    time: new Date().getTime() / 1000,
    room: data.room,
    score: 0,
    id: uid
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
    updateRooms(newroom);
    socket.emit("roomchange", {room: newroom});

  } else if (data.message.trim() == "rooms") {

    // Return the list of rooms.
    socket.emit("roomlist", {rooms: rooms});

  } else {
    socket.emit("unknown");
    return;
  }

  socket.emit("new", post);
  socket.broadcast.to(data.room).emit("new", post);
  saveData();
}

function upvotePost(id) {
  for (var thisPost in postMemory) {
    var post = postMemory[thisPost];
    if (post.id == id) {
      post.score++;
      return;
    }
  }
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

function updateRooms(roomname) {

  var now = new Date().getTime();
  var expireLimit = now - 86400000; // now - 1 day in ms

  var temprooms = rooms;
  rooms = [];

  // Filter out old rooms.
  // TODO: Don't be lazy and make this remove from rooms rather than recreate
  // every time.
  for (var room in temprooms) {
    if (temprooms[room].time > expireLimit) {
      rooms.push(temprooms[room]);
    }
  }

  // If the room has been touched in the past day, update the time.
  for (var room in rooms) {
    if (rooms[room].name == roomname) {
      rooms[room].time = new Date().getTime();
      return;
    }
  }

  // If this room hasn't been used in a day, add it.
  var newRoom = {
    name: roomname,
    time: new Date().getTime()
  };

  rooms.push(newRoom);
}

function formatPosts() {
  console.log("Updating post format...");
  var count = 0;
  for (var post in postMemory) {
    if (postMemory[post].id == undefined) {
      count++;
      var thisuid = uid++;
      postMemory[post].id = new Date().getTime() + "-" + Math.floor(Math.random() * 1000) + "-" + thisuid;
      postMemory[post].score = 0;
    }
  }
  console.log("Finished updating " + count + " posts.");
}

// Set socket.io's log level. Change to 3 to see debug info.
io.set("log level", 2);

// Load up the server memory, if any.
loadData();

// Conditionally run an update.
if (argv.update) {
  formatPosts();
}

// Start listening.
server.listen(port);
