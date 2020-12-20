var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require("fs");
var path = require("path");
const _exec = require('child_process').exec;

var rtot = JSON.parse(fs.readFileSync("base.json"));
var rpassw=rtot.passw;
delete rtot.passw;

const shell = (cmd) => {
    return new Promise((resolve, reject) => {
        _exec(cmd, (e, stdout, stderr) => {
            if (e instanceof Error) {
                reject(e);
            } else {
                resolve(stdout);
            }
        });
    })
}

var getfile = (ff) => {
    try {
        return fs.readFileSync(`/proc/${ff}`).toString();
    } catch (error) {
        return ""        
    }
}

getiniinfo = () => {
    return new Promise(resolve=>{
        Promise.all([
            shell("cat /proc/cpuinfo | grep processor | wc -l "),
            shell("cat /proc/cpuinfo | grep 'model name'  |  head -1"),
            shell("df -h | grep dev/sda"),
            
        ]).then(d => {
            rtot.cores = d[0];
            rtot.processor = d[1].split(':')[1].trim();
            
            var res=/(\S*)\s*(\S*)\s*(\S*)\s*(\S*)/gim.exec(d[2]);
            if (res) {
                rtot.diskname=res[1];
                rtot.disktot=res[2];
                rtot.diskused=res[3];
                rtot.diskfree=res[4];
            }
            resolve()
        }).catch(e=>{
            rtot.processor="undefined";
            resolve();
        })
    })
    
}

var ptotal = 0, pidle = 0, pnidle = 0;
var total, idle, perc;

var getmem = () => {
    getcpu = () => {
        var xx = getfile("stat").split("\n")[0];
        xx = xx.split(/\s+/);
        for (var i = 1; i < 9; i++) xx[i] = Number(xx[i]);

        var ni = xx[1] + xx[2] + xx[3] + xx[6] + xx[7] + xx[8]
        var i = xx[4] + xx[5];
        var t = i + ni;
        if (t > ptotal) {
            total = t - ptotal;
            idle = i - pidle;
            perc = Math.floor((total - idle) / total * 1000) / 10;
            ptotal = t;
            pidle = i;
            pnidle = ni;
        }
        return perc;
    }
    var xx = getfile("meminfo")
    var ma = 0, mt = 0, mf = 0
    if (r1) ma = Number(r1[1]);
    var r1 = /memavailable:\s*(\d+)/im.exec(xx);
    if (r1) mf = Number(r1[1]);
    var r1 = /memtotal:\s*(\d+)/im.exec(xx);
    if (r1) mt = Number(r1[1]);
    rtot.memory = `total mem: ${Math.floor(mt / 1024)} mb, used mem: ${Math.floor((mt - mf - ma) / 1024)} mb,  used ${Math.floor((mt - mf - ma) / mt * 100)} %`
    rtot.cpu = getcpu();
}




app.get('/', function (req, res) {
    res.sendfile('index.html');
});

//Whenever someone connects this gets executed
io.on('connection', function (socket) {
    /*   magari da provare !! *****
    var pm2infor=(r)=>{
        return new Promise((resolve,reject)=>{
            shell(`ps -p ${r.pid} -o %cpu,%mem,etime,stat,logname,args -w`).then(d=>{
                r.dd=d;
                resolve();
            }).catch(e=>resolve());
        })
    }
    
    var pm2info=()=>{
        var rr=[];
        for (var r of rtot.rr) 
            rr.push(pm2infor(r))
        Promise.all(rr).then(()=>{
            socket.emit('pm2list', rtot);
        })
    }
    */
    var pm2stat = () => {
        shell("pm2 ls").then(d => {
            var vv = d.split(/[\n\r]+/);
            rr = [];


            for (var v1 of vv) {
                    var tm = {};
                    v = v1.split("│");
                    if (v[1]) {
                        var id=Number(v[1].trim());
                        if (!isNaN(id)) {
                            tm.id = id;
                            tm.name = v[2].trim();
                            tm.pid = Number(v[6].trim());
                            tm.uptime = v[7].trim();
                            tm.refresh = Number(v[8].trim());
                            tm.status = v[9].trim();
                            tm.cpu = v[10].trim();
                            tm._cpu = v[10].replace('%', '') / 100;
                            tm.mem = v[11].trim();
                            rx = /([\d\.]+)(\w+)/gim.exec(v[11]);
                            if (rx) tm._mem = Number(rx[1]);
                            rr.push(tm);
                        }
                    }
            }
            getmem();
            rtot.rr = rr;
            rtot.synccopie=fs.existsSync("../update")
            socket.emit('pm2list', rtot);
        })
    }

    console.log('user connect');
    var ii = 0;
    pm2stat();
    var id = setInterval(pm2stat, 1783);
    socket.on("reset", (d) => {
        console.log(d)
        if (d.key == rpassw) {
            shell(`pm2 restart ${d.name}`).then(d => {
                rtot.err = ""
                pm2stat();
            })
        } else {
            rtot.err = "wrong password"
        }
    });
    socket.on("update",(d)=>{
        _exec(`../update "${d}"`, (e, stdout) => {
            if (e) {
                  fs.appendFileSync("err.log",e)
            } else {
                fs.appendFileSync("x.log",stdout)
            }
            rtot.err = ""
            pm2stat();
        });
    })
    socket.on('disconnect', function () {
        clearInterval(id);
        console.log('user disconnect');
    });
});



getiniinfo().then(()=>{
    http.listen(3500, function () {
        console.log('listening on *:3500');
    });

})
