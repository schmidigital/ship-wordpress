
function shell(cmd, sync) {

  var full_command = spawnargs(cmd);

  var command = full_command[0];
  var args = full_command;
  args.shift();


  process.stdin.pause();
  process.stdin.setRawMode(false);

  var spawn = spawnAsync;
  var ch;

  if (sync) {
    ch = spawnSync(command, args, {
      stdio: [0, 1, 2]
    });
  }
  else {
    ch = spawnAsync(command, args, {
      stdio: [0, 1, 2]
    });
    ch.on('exit', function() {
      process.stdin.setRawMode(true);
    });

    ch.on('err', function() {
      console.log("Error!".red)
    });
  }

}
