const os = require('os');
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require("fs");
var path = require("path");
const exec = require('child_process').exec;
const user = os.userInfo().username


var rtot = JSON.parse(fs.readFileSync("base.json"));
if (!rtot.disk) rtot.disk = '/dev/root'
var rpassw = rtot.passw;
delete rtot.passw;
var vv=__dirname.split('/');
rtot.name=vv[vv.length-1];


const shell = (cmd) => {
    return new Promise((resolve, reject) => {
        exec(cmd, (e, stdout, stderr) => {
            if (e) {
                reject(e);
            } else {
                resolve(stdout);
            }
        });
    })
}
var gettime = (h1) => {
    var h2 = process.hrtime(h1);
    return h2[0] + h2[1] / 1000000000
}

var getfile = (ff) => {
    try {
        return fs.readFileSync(`/proc/${ff}`).toString();
    } catch (error) {
        return ""
    }
}

var ptotal = 0, pidle = 0, pnidle = 0;
var total, idle, perc;

var ptotal = 0, pidle = 0, pnidle = 0;
var total, idle, perc;

async function gettemperatura() {
    try {
        var h0 = process.hrtime();

        var res = await shell("/opt/vc/bin/vcgencmd measure_temp");
        rtot.gputemp = parseFloat(res.split('=')[1]) + "'C";
        res = await shell("cat /sys/class/thermal/thermal_zone0/temp");
        rtot.cputemp = parseInt(res / 100) / 10 + "'C"
        rtot.temptime = gettime(h0);
    } catch (e) {
        rtot.temp = false;
        rtot.temperr = e.message;
    }
}

var getmem = () => {
    var h0 = process.hrtime();
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
    rtot.pstime9 = gettime(h0);
}


getiniinfo = () => {
    return new Promise(resolve => {
        var h0 = process.hrtime();
        Promise.all([
            shell("cat /proc/cpuinfo | grep processor | wc -l "),
            shell("cat /proc/cpuinfo | grep 'model name'  |  head -1"),
            shell(`df -h | grep ${rtot.disk}`),

        ]).then(d => {
            rtot.cores = d[0];
            rtot.processor = d[1].split(':')[1].trim();
            rtot.pstime0 = gettime(h0);
            var res = /(\S*)\s*(\S*)\s*(\S*)\s*(\S*)/gim.exec(d[2]);
            if (res) {
                rtot.diskname = res[1];
                rtot.disktot = res[2];
                rtot.diskused = res[3];
                rtot.diskfree = res[4];
            }
            resolve()
        }).catch(e => {
            console.log("errore", e);
            rtot.error = e;
            rtot.processor = "undefined";
            resolve();
        })
    })

}

const reg1 = /^\s*(\w+)\s+([\d\.]+)\s+([\d\.]+)\s+(\d+)\s*([\d\:\-]+)\s+node\s+([\w\/\.]+)/gim


async function updateps() {
    var h1 = process.hrtime();
    var v = await shell(`ps -u ${user} o pid,pcpu,pmem,rss,etime,args`);
    var tmv = [];
    var id = 0;
    var trova;
    for (; ;) {
        //console.log(id++,reg1,reg1.test(v));
        reg1.test("");
        trova = reg1.exec(v);

        if (trova) {
            var xx = trova[6].split('/')[4] || ''
            if (xx)
                tmv.push({
                    pid: parseInt(trova[1]),
                    cpu: parseFloat(trova[2]),
                    mem: parseFloat(trova[3]),
                    size: Math.floor(parseInt(trova[4]) / 102.4) / 10 + 'mb',
                    time: trova[5],
                    site: xx
                });
            v = v.substr(trova.index + trova[0].length);
            //       fs.writeFileSync("out.txt",v);
        } else {
            break;
        }
    }
    rtot.rr = tmv;
    rtot.pstime1 = gettime(h1)
}




app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname,'index.html'));
});

//Whenever someone connects this gets executed
io.on('connection',async function (socket) {
    await getiniinfo();
    async function pm2stat () {
        await updateps();
        await gettemperatura();
        getmem();
        socket.emit('pm2list', rtot);
    }
  
    console.log('user connect');
    var ii = 0;
    await pm2stat();
    var id = setInterval(await pm2stat, 1783);
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
