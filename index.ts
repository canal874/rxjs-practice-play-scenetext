
import { BehaviorSubject, Subscription, Observable, interval } from "rxjs";
import { take, map, scan, concatMap, filter } from "rxjs/operators";

console.clear();

/*-----------------------------
TODO: 
・アクションの開始時刻のオフセット
・シーンの一時停止とレジューム
------------------------------*/

const defaultStrInterval = 100;
const defaultStrAfterWait = 1000;

interface SceneCommand {
  command: string;
  cut?: Array<Object>;
}

interface SceneStatus {
  status: string;
  previous_command: string;
  cut: Array<Object>;
  subscription: Subscription;
}

interface StringAction {
  str: string;
  interval: number;
  afterWait: number;
}

interface Agent {
  name: string;
  text?: Array<Object>;
}

const SCENE_STATUS_INITIAL = 'initial';
const SCENE_STATUS_PLAYING = 'playing';
const SCENE_STATUS_PAUSED = 'paused';
const SCENE_STATUS_COMPLETED = 'completed';

const SCENE_COMMAND_NONE = 'none';
const SCENE_COMMAND_PLAY = 'play';
const SCENE_COMMAND_PUSH_CUT = 'push_cut'; // Add new cut after the last cut
const SCENE_COMMAND_PAUSE = 'pause';
const SCENE_COMMAND_STOP = 'stop';

// CUT: sequence of ACTIONS
const CUT01 = [
  // ACTION

  {
    // Parallel actions ('all' or 'race')
    all: [{
      agent: {
        name: 'Japanese',
        text: [{ str: 'それは、', interval: 300 },
        { str: 'まるで、' },
        { str: '夢のようで、' },
        { str: 'あれ、覚めない、覚めないぞ、', afterWait: 2500 },
        { str: 'って思っていて、' }]

      }
    },
    {
      agent: {
        name: 'English',
        text: [{ str: 'soreha, ', interval: 100, afterWait: 1000 },
        { str: 'marude', interval: 100, afterWait: 1000 },
        { str: 'yumenoyoude', interval: 100, afterWait: 1000 },
        { str: 'are, samenai, samenaizo', interval: 100, afterWait: 3000 },
        { str: 'tte omotteite,', interval: 100, afterWait: 1000 }]
      }
    }]
  },
  // Global command
  { command: { wait: 3000 } },
  // Single action
  {
    agent: {
      name: 'Japanese',
      text: [{ str: 'それがいつまでも続いて。' },
      { str: '・・', interval: 500, afterWait: 2000 },
      { str: 'まだ続いている' }]
    }
  }
]

const CUT02 = [
  //  ["それがいつまでも続いて。"],
  //  ["・・", 2000, 500],
  //  ["まだ続いている。"]
];

// SCENE: sequence of CUTS
const SCENE01 = [
  CUT01,
  CUT02,
  []
];

// SEQUENCE: sequence of SCENES
const SEQUENCE = [
  SCENE01
]

const timeout = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms))
};


const loadNextCut = () => {
  return SCENE01.shift();
};



function renderScene(output) {
  document.getElementById(output.agent.name).innerHTML += output.data;
}

const actionSubject = new Observable(subscriber => {

  playActions(sceneSubj.getValue().cut);

  /*------------------------------------
  / Play Actions
  /------------------------------------ */
  function playActions(cut: Array<Object>) {
    const playOneAction = async (action) => {
      const execAgentAction = async (agent) => {
        if (agent.hasOwnProperty('text')) {
          await playText(agent);
        }
      };
      const execCommand = async (command) => {
        if (command.hasOwnProperty('wait')) {
          await timeout(command.wait);
        }
      };
      if (action.hasOwnProperty('agent')) {
        // Single action
        await execAgentAction(action.agent);
      }
      else if (action.hasOwnProperty('command')) {
        // Command
        await execCommand(action.command);
      }
      else if (action.hasOwnProperty('all')) {
        // Parallel actions (Promise.all())
        const arr = [];
        const actions = action.all;
        actions.forEach(action => arr.push(execAgentAction(action.agent)));
        await Promise.all(arr);
      }
      else if (action.hasOwnProperty('race')) {
        // Parallel actions (Promise.race())
        const arr = [];
        const actions = action.race;
        actions.forEach(action => arr.push(execAgentAction(action.agent)));
        await Promise.race(arr);
      }
    };
    (async () => {
      for (let i = 0; i < cut.length; i++) {
        await playOneAction(cut[i]);
      }
    })();

  };


  async function playText(agent: Agent) {
    const text: Array<Object> = agent.text as Array<Object>;
    await (async () => {
      for (let i = 0; i < text.length; i++) {
        const strAction: StringAction = text[i] as StringAction
        await playStringAction(agent, strAction);
        const afterWait = strAction.hasOwnProperty('afterWait') ? strAction.afterWait : defaultStrAfterWait;
        await timeout(afterWait);
      }
    })();
  };

  function playStringAction(agent: Agent, strAction: StringAction) {
    return new Promise(resolve => {

      const printOneChar = async (char, afterWaitMs) => {
        subscriber.next({ agent: agent, type: 'text', data: char });
        await timeout(afterWaitMs);
      };

      (async () => {
        const chars = strAction.str.split('');
        for (let i = 0; i < chars.length; i++) {
          const char = chars[i];
          const interval = strAction.hasOwnProperty('interval') ? strAction.interval : defaultStrInterval;
          await printOneChar(char, interval);
        }
        resolve();
      })();
    });
  }
});

// const actionSubjectFiltered = actionSubject.pipe(filter(output => output.agent.name == 'English'));
const actionSubjectFiltered = actionSubject.pipe();




/*------------------------------------
/ Manage Scene Status
/------------------------------------ */
const sceneSubj = new BehaviorSubject({
  command: SCENE_COMMAND_PLAY,
  cut: loadNextCut()
} as SceneCommand);

sceneSubj.pipe(
  scan((scene: SceneStatus, newcommand: SceneCommand) => {

    // PLAY
    if (newcommand.command == SCENE_COMMAND_PLAY
      && scene.status != SCENE_STATUS_PLAYING) {

      if (newcommand.cut === undefined) {
        console.log('Error: scene is undefined. ');
        return scene;
      }
      else if (newcommand.cut.length == 0) {
        console.log('All cuts have been played. ');

        // Stop to subscribe chatterObs
        scene.subscription.unsubscribe();

        const newstatus = SCENE_STATUS_COMPLETED;
        console.log('status:', scene.status, '=>', newstatus);

        return {
          status: newstatus,
          previous_command: newcommand.command,
          cut: [],
          subscription: null
        }
      }
      else {
        const newstatus = SCENE_STATUS_PLAYING;
        console.log('status:', scene.status, '=>', newstatus);
        return {
          status: newstatus,
          previous_command: newcommand.command,
          cut: newcommand.cut,
          subscription: actionSubjectFiltered.subscribe({
            next: val => renderScene(val)
          }
          )
        };
      }
    }


    // PUSH CUT
    if (newcommand.command == SCENE_COMMAND_PUSH_CUT
      && (scene.status == SCENE_STATUS_PLAYING || scene.status == SCENE_STATUS_PAUSED)) {

      if (newcommand.cut === undefined) {
        console.log('Error: scene is undefined. ');
        return scene;
      }
      else if (newcommand.cut.length == 0) {
        console.log('All cuts have been played. ');

        const newstatus = SCENE_STATUS_COMPLETED;
        console.log('status:', scene.status, '=>', newstatus);

        return {
          status: newstatus,
          previous_command: newcommand.command,
          cut: [],
          subscription: null
        }
      }
      else {
        return {
          status: scene.status,
          previous_command: newcommand.command,
          cut: newcommand.cut,
          subscription: actionSubjectFiltered.subscribe({
            next: val => renderScene(val)
          }
          )
        };
      }
    }


    // CANCEL
    else if (newcommand.command == SCENE_COMMAND_STOP
      && (scene.status == SCENE_STATUS_PLAYING
        || scene.status == SCENE_STATUS_PAUSED)) {

      console.log('Scene has been canceled');

      const newstatus = SCENE_STATUS_COMPLETED;
      console.log('status:', scene.status, '=>', newstatus);

      // Stop to subscribe chatterObs
      scene.subscription.unsubscribe();

      return {
        status: newstatus,
        previous_command: newcommand.command,
        cut: [],
        subscription: null
      }
    }


    else {
      console.log('invalid command:', newcommand.command, ',current status:', scene.status);
      return scene;
    }
  },
    {
      status: SCENE_STATUS_INITIAL,
      previous_command: SCENE_COMMAND_NONE,
      cut: [],
      subscription: null
    })
).subscribe();

