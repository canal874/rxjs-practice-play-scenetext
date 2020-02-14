import { BehaviorSubject, Subscription, Observable, interval } from "rxjs";
import { take, map, scan, concatMap } from "rxjs/operators";

/*-----------------------------
TODO: 
・シーンの一時停止とレジューム
・バックログ　
------------------------------*/

const defaultCharacterDelay = 100;
const defaultWordDelay = 1500;

interface Scene {
  command: string;
  scene?: Array<Array<string | number>>;
  subscription?: Subscription;
}

const SCENE_STATUS_INITIAL = 'initial';
const SCENE_STATUS_PLAYING = 'playing';
const SCENE_STATUS_PAUSED = 'paused';
const SCENE_STATUS_COMPLETED = 'completed';

const SCENE_COMMAND_NONE = 'none';
const SCENE_COMMAND_PLAY = 'play';
const SCENE_COMMAND_PAUSE = 'pause';
const SCENE_COMMAND_CANCEL = 'cancel'; // Cancel playing
const SCENE_COMMAND_FINISH = 'finish'; // Successful termination


const loadScene = () => {
  // ['word', delayAfterWord, delayAfterCharacter]
  return [
    ["それは、", 0, 100],
    ["まるで"],
    ["夢のようで、"],
    ["あれ、覚めない、覚めないぞ、", 3000],
    ["って思っていて、"],
    ["それがいつまでも続いて。"],
    ["・・", 2000, 500],
    ["まだ続いている。"]
  ];
};


 
/*------------------------------------
/ Manage Scene Status
/------------------------------------ */
const sceneSubj = new BehaviorSubject({ command: SCENE_COMMAND_PLAY, scene: loadScene(), subscription: null} as Scene);

sceneSubj.pipe(
  scan((current, newscene) => {
    if(current.command != newscene.command){
      if(newscene.command == SCENE_COMMAND_PLAY){
        const newstatus = SCENE_STATUS_PLAYING;
        console.log('status:',current.status,'=>',newstatus);
        return {
          status: newstatus,
          command: newscene.command,
          scene: newscene.scene,
          subscription: playScene()
        }
      }
      else if(newscene.command == SCENE_COMMAND_CANCEL
              || newscene.command == SCENE_COMMAND_FINISH){
        if(newscene.command == SCENE_COMMAND_CANCEL){
          console.log('Scene has been canceled');
        }
        const newstatus = SCENE_STATUS_COMPLETED;
        console.log('status:',current.status,'=>',newstatus);
        current.subscription.unsubscribe();
        return {
          status: newstatus,
          command: newscene.command,
          scene: [],
          subscription: null
        }
      }
      else{
        console.log('invalid command:',newscene.command);
      }
    }     
    return current
  },
  { 
    scene: [],
    command: SCENE_COMMAND_NONE,
    status: SCENE_STATUS_INITIAL,
    subscription: null
  })
).subscribe();


/*------------------------------------
/ Play Scene
/------------------------------------ */
function playScene(){

  // 入力されたscene内のセリフについて、
  // セリフ間に指定秒のディレイを入れつつ順に再生

  const inputSubj = new Observable(subscriber => {
    // waitMSec待ってから次の後を出力
    const nextword = (waitMSec, input) => {
      return new Promise(resolve => {
        subscriber.next(input);
        setTimeout(() => {
          resolve();
        }, waitMSec);
      }); 
    };

    // 配列を順番にPromiseで処理
    const sequential = function(array) {
      array.reduce((promise, val) => {
        return promise.then(() => {
            if(sceneSubj.getValue().command == SCENE_COMMAND_CANCEL){
              throw new Error();
            }
          }
        ).then(res => 
            nextword(val.length > 1 ? val[1] : defaultWordDelay, {
              str: val.length > 0 ? val[0] : "",
              interval: val.length > 2 ? val[2] : defaultCharacterDelay
            }) 
        )
      }, Promise.resolve())
      .then(() => {
        sceneSubj.next(
          {
            command: SCENE_COMMAND_FINISH,
          });
        }
      )
      .catch(() => {
        sceneSubj.next(
          {
            command: SCENE_COMMAND_CANCEL,
          });
      })
    };
    sequential(sceneSubj.getValue().scene);
  });
 

  // 入力されたセリフについて
  // 文字間に指定秒のディレイを入れつつ一文字ずつ表示

  const chatterObs = inputSubj.pipe(
    concatMap(input =>
      interval(input.interval).pipe(
        // 入力文字列を input.interval 間隔で一文字ずつ表示する
        scan(
          (state, count) => ({
            arr: state.arr,
            i: count % input.str.length
          }),
          {
            arr: input.str.split(""),
            i: 0
          }
        ),
        map(state => state.arr[state.i]),
        take(input.str.length)
      )
    )
  );

  return chatterObs.subscribe(
    out => (document.body.innerHTML += out)
  );
};




// Test for cancel command
/*
setTimeout(()=> sceneSubj.next(
    {
      command: SCENE_COMMAND_CANCEL,
    }), 7000);
*/