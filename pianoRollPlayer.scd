(
~newestNoteState = Dictionary.new;
~pianoRollPort = NetAddr("localhost", 5430);
~playerPatterns = Dictionary.new //has 2 patterns "notePlayer", "phaseTracker"
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
    //find notes that intersect pos
    //create dictionary of intersecting notes "chopped" to start at pos
    //unition chopped intersecting notes with notes starting after pos
    //flatten notes into individual on/off events
    //make pseq of notes and deltas

    //find "end time" of last event from prev seq
    //make pseq of frame-time updates where the seq value is just an increasing counter + "pos" variable bound in a closure

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

~newestNoteState[0]["position"] + 1

~pianoRollPort.sendMsg("/placeCursor", 2)

