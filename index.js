//--------------------------------------------------
//  Bi-Directional OSC messaging Websocket <-> UDP
//--------------------------------------------------
var osc = require("osc"),
    WebSocket = require("ws");

var getIPAddresses = function () {
    var os = require("os"),
    interfaces = os.networkInterfaces(),
    ipAddresses = [];

    for (var deviceName in interfaces){
        var addresses = interfaces[deviceName];

        for (var i = 0; i < addresses.length; i++) {
            var addressInfo = addresses[i];

            if (addressInfo.family === "IPv4" && !addressInfo.internal) {
                ipAddresses.push(addressInfo.address);
            }
        }
    }

    return ipAddresses;
};

/*
    OSC to/from Lemur Bounce Interface
*/
var udp = new osc.UDPPort({
    localAddress: "127.0.0.1",
    localPort: 5432,
    remoteAddress: "127.0.0.1",
    remotePort: 57120
});

udp.on("ready", function () {
    var ipAddresses = getIPAddresses();
    console.log("Interface:");
    ipAddresses.forEach(function (address) {
        console.log("Listening on", address + ":" + udp.options.localPort);
    });
    console.log("Sending to", udp.options.remoteAddress + ":" + udp.options.remotePort);
    console.log("");
});

udp.open();

var wss = new WebSocket.Server({
    port: 8087
});

wss.on("connection", function (socket) {
    console.log("A Web Socket connection has been established! (Interface)");
    var socketPort = new osc.WebSocketPort({
        socket: socket
    });

    var relay = new osc.Relay(udp, socketPort, {
        raw: true
    });
});

// var udp_viz = new osc.UDPPort({
//     localAddress: "127.0.0.1",
//     localPort: 7410,
//     remoteAddress: "127.0.0.1",
//     remotePort: 7600
// });

// udp_viz.open();

// var wss_viz = new WebSocket.Server({
//     port: 8082
// });

// wss_viz.on("connection", function (socket) {
//     console.log("A Web Socket connection has been established! (Interface2Viz)");
//     var socketPort = new osc.WebSocketPort({
//         socket: socket
//     });

//     var relay = new osc.Relay(udp_viz, socketPort, {
//         raw: true
//     });
// });


/*
    OSC to/from Lemur Bounce Visuals
*/
// var udp_viz_server = new osc.UDPPort({
//     localAddress: "127.0.0.1",
//     localPort: 7600,
//     remoteAddress: "127.0.0.1",
//     remotePort: 7400
// });

// udp_viz_server.on("ready", function () {
//     var ipAddresses = getIPAddresses();
//     console.log("Visuals:");
//     ipAddresses.forEach(function (address) {
//         console.log("Listening on", address + ":" + udp_viz_server.options.localPort);
//     });
//     console.log("Sending to", udp_viz_server.options.remoteAddress + ":" + udp_viz_server.options.remotePort);
//     console.log("");
// });

// udp_viz_server.open();

// var wss_viz_server = new WebSocket.Server({
//     port: 8083
// });

// wss_viz_server.on("connection", function (socket) {
//     console.log("A Web Socket connection has been established! (Visuals)");
//     var socketPort = new osc.WebSocketPort({
//         socket: socket
//     });

//     var relay = new osc.Relay(udp_viz_server, socketPort, {
//         raw: true
//     });
// });

// var express = require('express');
// var app = express();
// var path = require('path');

// app.use(express.static( __dirname + '/web'));

// app.get('/', function (req, res) {
//   res.sendFile(path.join(__dirname, 'web', 'index.html'));
// });

// app.get('/visualize', function (req, res) {
//   res.sendFile(path.join(__dirname, 'web', 'visualize.html'));
// });

// app.listen(3000, function () {
//   console.log('Node server is listening on port 3000!');
// });
