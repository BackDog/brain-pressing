'use strict'

const fs = require('fs');
const express = require('express');

const { WebSocket, WebSocketServer } = require('ws');

const cors       = require('cors');
const bodyParser  = require('body-parser');
const https = require('https');
const { brain } = require('brain.js');
var parse = require('node-html-parser');

const PORT = process.env.PORT || 8889;

var app = express();
app.use(express.static(__dirname + '/public'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());
app.options('*', cors());

var server = app.listen(PORT, function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log("Example app listening at http://%s:%s", host, port);
});

const wss = new WebSocketServer({ server });

var settingData = fs.readFileSync('setting.json');
var setting = JSON.parse(settingData);

wss.on('connection', function connection(ws) {
    ws.send(JSON.stringify({ command: "SETTING", data: setting}));
	ws.on('open', function open() {
		console.log('connected');
	});
    ws.on('message', function incoming(message) {
        wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message.toString());
            }
        });
        if (isJsonString(message.toString())) {
            var json = JSON.parse(message.toString());
            if (json.command === "SAVE SETTING") {
                saveSetting(json.data);
            }
        }
    });
    ws.on('close', function close() {
		console.log('disconnected');
	});
});

app.post('/prediction', function (req, res, next) {
	console.log(req.body);
    var body = req.body;
    var json = calculatePrediction(body.link, res);
});

app.get('/prediction', function (req, res) {
    res.end('NOOOOOOOOOOOOOOOOOOOO');
});

function isJsonString(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

function saveLog(json) {
    var data = JSON.stringify(json);
    fs.appendFile('public/log.txt', data);
}

async function chttps(method, url, data) {
  const dataString = JSON.stringify(data)
  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': dataString.length,
    },
    timeout: 30000, // in ms
  }
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      if (res.statusCode < 200 || res.statusCode > 299) {
        return reject(new Error(`HTTP status code ${res.statusCode}`))
      }
      const body = []
      res.on('data', (chunk) => body.push(chunk))
      res.on('end', () => {
        const resultString = Buffer.concat(body).toString()
        resolve(resultString)
      })
    })
    req.on('error', (err) => {
      reject(err)
    })
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request time out'))
    })
    req.write(dataString)
    req.end()
  })
}

async function getData(name, path, preArray, callback){
  console.log('https://en.game-tournaments.com/' + path);
   const res = await chttps('GET', 'https://en.game-tournaments.com/' + path, "");
   const root = parse.parse(res);
   var matchs_past = root.querySelector('#block_matches_past').querySelector('table').childNodes;
   var array = [];
   for (let i of  matchs_past) {
      if (i.rawTagName === 'tr'){
         var obj = {
            type: name
         };
         var live = i.rawAttrs.indexOf(' class="mlive');
         obj.rel = i.rawAttrs.substring(5, (live === -1 )? i.rawAttrs.length -1 : live - 1 );
         var str = i.childNodes[3].childNodes[1].rawAttrs;
         obj.link = str.substring(str.indexOf('href=')+6, str.indexOf(' title=') - 1);
         obj.title = str.substring(str.indexOf('tle=') + 5, str.indexOf(' class=') - 1);

            var datetime = i.childNodes[5].childNodes[3].childNodes[1].rawText;
            var date = datetime.split(" ")[0].split('-');
            var time = datetime.split(" ")[1].split(':');
            var datetime_1 = new Date(date[0], date[1], date[2], time[0], time[1], time[2], 0).getTime();

         obj.datetime = datetime_1;
         obj.year = parseInt(date[0]);
         obj.month = parseInt(date[1]);
         obj.day = parseInt(date[2]);

         obj.team1 = i.childNodes[3].childNodes[1].childNodes[1].childNodes[1].childNodes[1].rawText;
         obj.teamName1 = "";
         obj.betPer1 = parseFloat(i.childNodes[3].childNodes[1].childNodes[3].childNodes[1].rawText.substring(1,5));
         var scoreText = i.childNodes[3].childNodes[1].childNodes[3].childNodes[3].childNodes[1].rawAttrs;
         var indexScoreText = scoreText.indexOf(' data-score="') + 13;
         obj.score = scoreText.substring(indexScoreText, indexScoreText+5 );
         
         obj.betPer1 = isNaN(obj.betPer1) ? 0 : obj.betPer1;

         obj.team2 = i.childNodes[3].childNodes[1].childNodes[5].childNodes[3].childNodes[1].rawText;
         obj.teamName2 = "";
         obj.betPer2 = parseFloat(i.childNodes[3].childNodes[1].childNodes[3].childNodes[5].rawText.substring(1,5));
         obj.betPer2 = isNaN(obj.betPer2) ? 0 : obj.betPer2;

         str = i.childNodes[7].childNodes[1].rawAttrs;
         obj.leagueLink = str.substring(str.indexOf('href=')+6, str.indexOf(' title=') - 1);
         obj.leagueName = str.substring(str.indexOf('tle=') + 5, str.length - 1);

         obj.teamName1 = obj.link.split(obj.leagueLink + '/')[1].split('-vs-')[0];
         obj.teamName2 = obj.link.split(obj.leagueLink + '/')[1].split('-vs-')[1].split('-' + obj.rel)[0];
         str = obj.leagueLink.split("/");
         obj.typeGame = str[3];
         obj.leagueLink = '/' + str[1] + '/' + str[2];
         array.push(obj);
      }
   }
   array = array.concat(preArray);
   callback(array);
}

function calculatePrediction(url, res) {	
	try {
  var net = new brain.NeuralNetwork();
  var dataSplit = url.split('/');
  var typeGame = dataSplit[3];
  var team = dataSplit[6].split('-vs-');
  var name1 = team[0];
  var index = team[1].lastIndexOf('-');
  var name2 = team[1].substring(0, index);

  var pathTeam1 = typeGame + '/team/' + name1;
  var pathTeam2 = typeGame + '/team/' + name2;
  var pathHistory = typeGame + '/history/' + name1 + '-vs-' + name2;
 var pathTourament = typeGame + '/' + dataSplit[4] + '/' + dataSplit[5]; 
 
  getData(typeGame, pathTeam1, [], function(data1) {
    getData(typeGame, pathTeam2, data1, function(data2) {
      getData(typeGame, pathHistory, data2, function(data3) {
      getData(typeGame, pathTourament, data3, function(data4) {
        var trainArray = [];
        for (const d of data4) {
          var obj = { input: {} , output: {}};

          obj.input[d.typeGame] = 1;
          obj.input[d.teamName1] = 1;
          obj.input[d.teamName2] = 1;
          obj.input[d.leagueLink.split('/')[2]] = 1;
          var array = d.leagueLink.split('/')[2].split('-');
          for ( var i of array) {
          	obj.input[i] = 1;	
          }
//           obj.input['year-'    + d.year]    = 1;
//           obj.input['month-' + d.month] = 1;
//           obj.input[d.year + '-' + d.month] = 1;

          obj.output[d.teamName1 + '-win'] = ((d.score === '2 : 0') || (d.score === '2 : 1')
            || (d.score === '3 : 1') || (d.score === '3 : 2') || (d.score === '3 : 0')) ? 1 : 0;
          obj.output[d.teamName2 + '-win'] = ((d.score === '0 : 2') || (d.score === '1 : 2')
            || (d.score === '1 : 3') || (d.score === '2 : 3') || (d.score === '0 : 3')) ? 1 : 0;
          trainArray.push(obj);
        }
        net.train(trainArray);
        var input = {};
        input[typeGame] = 1;
        input[name1] = 1;
        input[name2] = 1;
        input[dataSplit[5]] = 1;
        input[dataSplit[4]] = 1;
        var array = dataSplit[4].split('-');
        for ( var i of array) {
        	input[i] = 1;	
        }

//         const d = new Date();
//         input['year-'    + d.getFullYear()] = 1;
//         input['month-' + d.getMonth()]    = 1;
// 	input[d.year + '-' + d.month] = 1;

        const output = net.run(input);
        // console.log(output);
        // console.log('training data size', trainArray.length);
        // console.log(name1, output[name1 + '-win']);
        // console.log(name2, output[name2 + '-win']);
        var json = {
        	size: trainArray.length
        }
        json[name1] = output[name1 + '-win'];
        json[name2] = output[name2 + '-win'];
        json.teamName1 = name1;
        json.teamName2 = name2;
        console.log(json);
	fs.appendFile('public/log.txt', JSON.stringify(json));
        res.send(JSON.stringify(json));
        });
      });
    });
  });
  } catch (error) {
  	res.send(JSON.stringify({error: error}));
  }
}
