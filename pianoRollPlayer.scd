(
var midiOut = ~getMidiOut.("IAC Driver", "Bus 2");
var pianoRollPort = NetAddr("localhost", 5430);
~newestNoteState = Dictionary.new;
~pianoRollPort = pianoRollPort;
~playerPatterns = Dictionary.new; //has 2 patterns "notePlayer", "phaseTracker"
~tempoClock = TempoClock.new(2);

OSCFunc.new({|msg, time, addr, recvPort|
    ~newestNoteState = msg[2].asString.parseJson.collect({|note|
        var cleanNote = Dictionary.new;
        cleanNote["pitch"] = note["pitch"].asFloat;
        cleanNote["position"] = note["position"].asFloat;
        cleanNote["duration"] = note["duration"].asFloat;
        cleanNote
    });
    ~newestNoteState.postln;
}, "pianoRollNotes");


~startPlaying = {|pos|
    var intersectNotes, choppedNotes, notesToPlay, onOffEvents, onOffDeltas, notePlayer, phaseTracker, lastEventTime, cursorFramerate, playLength, numFramesToPlay;
    //find notes that intersect pos
    intersectNotes = ~newestNoteState.select({|note| (note["position"] <= pos) && (pos < (note["position"]+note["duration"]))});
    //create dictionary of intersecting notes "chopped" to start at pos
    "A".postln;

    choppedNotes = intersectNotes.collect({|note|
        var newNote = note.deepCopy;
        newNote["position"] = pos;
        newNote
    });
    "B".postln;

    //union chopped intersecting notes with notes starting after pos
    notesToPlay = choppedNotes ++ ~newestNoteState.select({|note| pos < note["position"]});
    "C".postln;

    //flatten notes into individual on/off events and sort
    onOffEvents = notesToPlay.collect({|note|
        [[note["position"], note["pitch"], 'on'], [note["position"]+note["duration"], note["pitch"], 'off']]
    });
    onOffEvents = onOffEvents.flatten(1);
    "D1".postln;
    onOffEvents.sort({|a, b| a[0] < b[0]});
    ["D2", onOffEvents].postln;

    //make deltas
    onOffDeltas = onOffEvents.deepCopy;
    ((onOffDeltas.size-1)..0).do({|i|
        if(i == 0,
            { onOffDeltas[i][0] = 0},
            { onOffDeltas[i][0] =  onOffDeltas[i][0] - onOffDeltas[i-1][0]}
        );
    });
    ["E", onOffDeltas].postln;

    //make pbind
    notePlayer = Pbind(
        \delta, Pseq(onOffDeltas.collect({|e| e[0]})-pos),
        \midiEvent, Pseq(onOffDeltas),
        \play, {if(~midiEvent[2] == \on, {midiOut.noteOn(0, ~midiEvent[1])}, {midiOut.noteOff(0, ~midiEvent[1])})}
    );
    "F".postln;

    //find "end time" of last event from prev seq
    lastEventTime = onOffEvents.wrapAt(-1)[0];
    cursorFramerate = 60;
    playLength = lastEventTime-pos;
    numFramesToPlay = (playLength / ~tempoClock.tempo * cursorFramerate).round;

    //make pseq of frame-time updates where the seq value is just an increasing counter + "pos" variable bound in a closure
    phaseTracker = Pbind(
        \delta, 1/cursorFramerate,
        \playPhaseInc, Pseq((0..numFramesToPlay).asList),
        \play, {pianoRollPort.sendMsg("/placeCurosr", (~playPhaseInc*(lastEventTime-pos))+pos)}
    );
    "G".postln;

    ~playerPatterns["notePlayer"] = notePlayer.play(~tempoClock);
    ~playerPatterns["phaseTracker"] = phaseTracker.play(~tempoClock);

};
// msg[1] is time to start playing from
OSCFunc.new({|msg, time, addr, recvPort|
    ~startPlaying.(msg[1]);
}, "/startPlaying");

~stopPlaying = {

};
OSCFunc.new({|msg, time, addr, recvPort|
    ~stopPlaying.();
}, "/stopPlaying");

)

[[1, 2, [3, 4]], [5, 6, [7, 6]]].flatten

~startPlaying.(0)

~newestNoteState[0]["position"] + 1

~pianoRollPort.sendMsg("/placeCursor", 2)

a.select({|n| n < 2})
a = [1, 2, 3, 4]
a.collect({|e, i| [e, i, c].postln;})
a.wrapAt(-1)