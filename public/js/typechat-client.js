(function typechat() {

// Variables containing the global state of the user.
var state = {
  status: "start",
  room: "home",
  topic: $("title").html()
}

// Unique ID variable for whatever use.
var uid = 0;

// URL matching pattern.
var urlPattern = /(http|ftp|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/;

// Connect to the server.
var socket = io.connect("http://" + location.host);

// Run when we connect.
socket.on("connect-ack", function(data) {
  joinServer();
  socket.emit("getMemory", {room: state.room});
});

// Add all the content when we get a postMemory event.
socket.on("postMemory", function(data) {
  for (var i = 0; i < data.posts.length; i++) {
    addContent(data.posts[i]);
  }

  $(".vote").each(function() {
    var postId = this.id;
    $(this).click(function(event) {
      console.log(event);
      if (event.button === 0) {
        if (event.shiftKey) {
          downvote(postId);
        } else {
          upvote(postId);
        }
      }
      $(this).off("click");
    });
  });

});

socket.on("new", function(data) {
  addContent(data);
  $("#" + data.id).click(function() {
    upvote(data.id);
    $(this).off("click");
  });
});

socket.on("namechange", function(data) {
  state.username = data.newName;
});

socket.on("roomchange", function(data) {
  state.room = data.room;
  $("#content").html("");
  $("title").text("[" + data.room + "] " + state.topic);
  socket.emit("getMemory", {room: state.room});
});

socket.on("roomlist", function(data) {
  data.rooms.sort(function(a, b) {
    return b.time - a.time;
  })
  

  var rooms = "";
  for (var room in data.rooms) {
    rooms += "<div class='addition toplevel'><div class='link'><a href='#' onclick=\"changeRoom('" + data.rooms[room].name + "')\">" +
     data.rooms[room].name + "</a></div></div>";
  }
  $("#content").fadeOut(function() {
    $("#rooms").html(rooms);
    $("#rooms").fadeIn();
  });
});

function addContent(data) {
  if (state.status == "connected") {
    $("#mainInput").attr("placeholder", "Paste or type...");
  }
  var add = "";

  var upvoteHTML = "<span class='vote' id='" + data.id + "'>+" + data.score + "</span>";

  // Create the timestamp.
  var dateObj = data.time * 1000;
  var timestamp = moment(dateObj).format("M/D/YY, h:mm:ss a");

  if (data.type == "comment") {
    add = $("<div class='addition'><div class='comment'>" + data.content + "</div>" +
      "<div class='author'>" + data.author + " - " + timestamp + " - " + upvoteHTML + "</div></div>");

    if (data.lookback) {
      if ($(".toplevel").size() > parseInt(data.lookback)) {
        $($(".toplevel").get(parseInt(data.lookback))).append(add);
      } else {
        $(".toplevel").first().append(add);
      }
    } else {
      $(".toplevel").first().append(add);
    }

  } else if (data.type == "namechange") {
    add = $("<div class='addition'><div class='nameChange'>" + data.content + "</div>" +
      "<div class='author'>" + data.author + " - " + timestamp + " - " + upvoteHTML + "</div></div>");
    $(".toplevel").first().append(add);

  } else if (data.type == "link") {
    add = $("<div class='addition toplevel'><div class='link'>" +
     "<a target='_blank' href='" + data.content + "'>" + data.content + "</a></div>" +
      "<div class='author'>" + data.author + " - " + timestamp + " - " + upvoteHTML + "</div></div>");
    $("#content").prepend(add);
  } else if (data.type == "text") {
    add = $("<div class='addition toplevel'><div class='link'>" +
     data.content + "</div>" +
      "<div class='author'>" + data.author + " - " + timestamp + " - " + upvoteHTML + "</div></div>");
    $("#content").prepend(add);
  }

}

socket.on("unknown", function() {
  $("#mainInput").attr("placeholder", "Give a link or !, >, @ or /");
});

$(document).ready(function() {

  //$("html").click(function() {
  //  $("#mainInput").focus();
  //});

  // Animation for action div
  $("#mainInput").keyup(function(e) {

    var input = $(this);

    $("#enterAction").stop(true);

    if ($(this).val().trim() != "") {
      if (state.status == "start" || state.status == "connecting") {
        setEnterAction("Join this typechat");
      } else {

        if (input.val().trim()[0] == "!") {

          if (input.val().match(/\!\-[0-9]+/)) {
            console.log("oi");
            var lookback = input.val().match(/[0-9]+/)[0];
            if ($(".toplevel").size() > parseInt(lookback)) {
              var link = $($(".toplevel .link").get(parseInt(lookback))).html();
              setEnterAction("Comment about " + link);
              return;
            }
          }

          var link = $(".toplevel .link").first().html();
          setEnterAction("Comment about " + link);
        } else if (input.val().trim()[0] == "@") {
          setEnterAction("Update Name");
        } else if (input.val().trim()[0] == "?") {
          setEnterAction("Get Help");
        } else if (input.val().trim()[0] == "/") {
          setEnterAction("Join " + input.val().trim().substring(1));
        } else if (input.val().trim()[0] == "#") {
          setEnterAction("Search for '" + input.val().trim().substring(1) + "'");
        } else if (input.val().trim()[0] == ">") {
          setEnterAction("Text Post");
        } else if (input.val().trim().match(urlPattern) !== null) {
          setEnterAction("Post Link");
        } else {
          $("#enterAction").animate({
            opacity: 0
          }, 500);
          return;
        }
      }

      $("#enterAction").animate({
        opacity: .5
      }, 500);
    } else {
      $("#enterAction").animate({
        opacity: 0
      }, 500);
    }
  });

  // Enter actions.
  $("#mainInput").keypress(function(e) {
    if ( e.keyCode == 13 && $("#mainInput").val().trim() != "" ) {
      enter();
    }
  });

});

function enter() {
  var input = $("#mainInput");
  var text = input.val();

  // Connect if we have yet to.
  if (state.status == "start") {
    input.val("Connecting...");
    state.status = "connecting";
    input.attr("disabled", "true");
    connect(text);
    return;
  }

  if (input.val().trim()[0] == "?") {
    var win = window.open("/help", '_blank');
    win.focus();
    input.val("");
    return;
  }

  // Otherwise, send a mesage.
  input.val("");
  socket.emit("send", {
    username: state.username,
    message: text,
    room: state.room
  });

  if (text != "rooms") {
    $("#rooms").fadeOut(function() {
      $("#content").fadeIn();
    });
  }

}

function upvote(id) {
  socket.emit("vote", {
    id: id
  });
  oldScore = parseInt($("#" + id).html());
  newScore = ++oldScore;
  $("#" + id).html("+" + newScore);
}

function downvote(id) {
  socket.emit("downvote", {
    id: id
  });
  oldScore = parseInt($("#" + id).html());
  newScore = --oldScore;
  if (newScore > 0) {
    $("#" + id).html("+" + newScore);
  } else {
    $("#" + id).html('' + newScore);
  }
}

function changeRoom(room) {
  socket.emit("send", {
    username: state.username,
    message: "/" + room,
    room: state.room
  });
  $("#rooms").fadeOut(function() {
    $("#content").fadeIn();
  });
  
}

function connect(input) {
  state.username = input;
  socket.emit("connect", {
    username: input
  });
}

function joinServer() {
  state.status = "connected";
  $("#enterAction").html("Welcome, " + state.username);
  setTimeout(showHelp, 1000);
  $("#mainInput").removeAttr("disabled");
  $("#mainInput").attr("placeholder", "Paste or type...");
  $("#mainInput").val("");
  $("#mainInput").animate({
    fontSize: "3em"
  }, 500);
}

function setEnterAction(action) {
  $("#enterAction").html(action + "&crarr;")
}

function showHelp() {
  $("#enterAction").html("Read <a target='_blank' href='/help'>this</a> for help.").animate({
    opacity: .5
  }, 500);
}

}());