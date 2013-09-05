Channel = function(synth) {
	this.synth = synth;
	this.generatorsByNote = {};
	this.currentProgram = Synth.program.Piano;
}

Channel.prototype.noteOn = function(note, velocity) {
	if (this.generatorsByNote[note] && !this.generatorsByNote[note].released) {
		/* playing same note before releasing the last one. BOO */
		this.generatorsByNote[note].noteOff(); /* TODO: check whether we ought to be passing a velocity in */
	}
	var generator = this.currentProgram.createNote(note, velocity, this.synth);
	this.synth.addGenerator(generator);
	this.generatorsByNote[note] = generator;
}

Channel.prototype.noteOff = function(note, velocity) {
	if (this.generatorsByNote[note] && !this.generatorsByNote[note].released) {
		this.generatorsByNote[note].noteOff(velocity);
	}
}

Channel.prototype.setProgram = function(programNumber) {
	this.currentProgram = Synth.PROGRAMS[programNumber] || Synth.program.Piano;
}

function Replayer(midiFile, synth) {
	this.finished = false;
	this.midiFile = midiFile;
	this.synth = synth;
	this.trackStates = [];
	this.beatsPerMinute = 120;
	this.ticksPerBeat = midiFile.header.ticksPerBeat;
	this.channelCount = 16;
	
	for (var i = 0; i < midiFile.tracks.length; i++) {
		this.trackStates[i] = {
			'nextEventIndex': 0,
			'ticksToNextEvent': (
				midiFile.tracks[i].length ?
					midiFile.tracks[i][0].deltaTime :
					null
			)
		};
	}

	this.channels = [];
	for (var i = 0; i < this.channelCount; i++) {
		this.channels[i] = new Channel(synth);
	}
	
	this.nextEventInfo = null;
	this.samplesToNextEvent = 0;

	this.getNextEvent();
}
	
Replayer.prototype.getNextEvent = function () {
	var ticksToNextEvent = null;
	var nextEventTrack = null;
	var nextEventIndex = null;
		
	for (var i = 0; i < this.trackStates.length; i++) {
		if (
			this.trackStates[i].ticksToNextEvent != null
			&& (ticksToNextEvent == null || this.trackStates[i].ticksToNextEvent < ticksToNextEvent)
		) {
			ticksToNextEvent = this.trackStates[i].ticksToNextEvent;
			nextEventTrack = i;
			nextEventIndex = this.trackStates[i].nextEventIndex;
		}
	}
	if (nextEventTrack != null) {
		/* consume event from that track */
		var nextEvent = this.midiFile.tracks[nextEventTrack][nextEventIndex];
		if (this.midiFile.tracks[nextEventTrack][nextEventIndex + 1]) {
				this.trackStates[nextEventTrack].ticksToNextEvent += this.midiFile.tracks[nextEventTrack][nextEventIndex + 1].deltaTime;
		} else {
			this.trackStates[nextEventTrack].ticksToNextEvent = null;
		}
		this.trackStates[nextEventTrack].nextEventIndex += 1;
		/* advance timings on all tracks by ticksToNextEvent */
		for (var i = 0; i < this.trackStates.length; i++) {
			if (this.trackStates[i].ticksToNextEvent != null) {
				this.trackStates[i].ticksToNextEvent -= ticksToNextEvent
			}
		}
		this.nextEventInfo = {
			'ticksToEvent': ticksToNextEvent,
			'event': nextEvent,
			'track': nextEventTrack
		}
		var beatsToNextEvent = ticksToNextEvent / this.ticksPerBeat;
		var secondsToNextEvent = beatsToNextEvent / (this.beatsPerMinute / 60);
		this.samplesToNextEvent += secondsToNextEvent * this.synth.sampleRate;
	} else {
		this.nextEventInfo = null;
		this.samplesToNextEvent = null;
		this.finished = true;
	}
}
	
	
Replayer.prototype.generate = function(samples) {
	var data = new Array(samples*2);
	var samplesRemaining = samples;
	var dataOffset = 0;
		
	while (true) {
		if (this.samplesToNextEvent != null && this.samplesToNextEvent <= samplesRemaining) {
			/* generate samplesToNextEvent samples, process event and repeat */
			var samplesToGenerate = Math.ceil(this.samplesToNextEvent);
			if (samplesToGenerate > 0) {
				this.synth.generateIntoBuffer(samplesToGenerate, data, dataOffset);
				dataOffset += samplesToGenerate * 2;
				samplesRemaining -= samplesToGenerate;
				this.samplesToNextEvent -= samplesToGenerate;
			}
			
			this.handleEvent();
			this.getNextEvent();
		} else {
			/* generate samples to end of buffer */
			if (samplesRemaining > 0) {
				synth.generateIntoBuffer(samplesRemaining, data, dataOffset);
				this.samplesToNextEvent -= samplesRemaining;
			}
			break;
		}
	}
	return data;
}
	
Replayer.prototype.handleEvent = function() {
	var event = this.nextEventInfo.event;
	switch (event.type) {
		case 'meta':
			switch (event.subtype) {
				case 'setTempo':
					this.beatsPerMinute = 60000000 / event.microsecondsPerBeat
			}
			break;
		case 'channel':
			switch (event.subtype) {
				case 'noteOn':
					this.channels[event.channel].noteOn(event.noteNumber, event.velocity);
					break;
				case 'noteOff':
					this.channels[event.channel].noteOff(event.noteNumber, event.velocity);
					break;
				case 'programChange':
					//console.log('program change to ' + event.programNumber);
					this.channels[event.channel].setProgram(event.programNumber);
					break;
			}
			break;
	}
}
	
Replayer.prototype.replay = function(audio) {
	console.log('replay');
	audio.write(generate(44100));
	var that = this;
	setTimeout(function() {that.replay(audio)}, 10);
}
	

