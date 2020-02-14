import { BehaviorSubject, Subscription, Observable, interval } from "rxjs";
import { take, map, scan, concatMap } from "rxjs/operators";

/*-----------------------------
TODO: 
・次シーンを呼んだ後、CANCELすると動作がおかしい。
・sceneSubjの副作用が複数回起きないよう注意する。
　参考： https://www.learnrxjs.io/learn-rxjs/operators/multicasting/share
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

const SCENES =  [
  // ['word', delayAfterWord, delayAfterCharacter]
    [
      ["それは、", 0, 100],
      ["まるで"],
      ["夢のようで、"],
      ["あれ、覚めない、覚めないぞ、", 3000],
      ["って思っていて、"]
    ],
    [
      ["それがいつまでも続いて。"],
      ["・・", 2000, 500],
      ["まだ続いている。"]
    ],
    // End
    []
];

const loadNextScene = () => {
  return SCENES.shift();
};

 
/*------------------------------------
/ Manage Scene Status
/------------------------------------ */
const sceneSubj = new BehaviorSubject({ command: SCENE_COMMAND_PLAY, scene: loadNextScene(), subscription: null} as Scene);

sceneSubj.pipe(
  scan((current, newscene) => {

    if(current.command != newscene.command){
      if(newscene.command == SCENE_COMMAND_PLAY
               && current.status != SCENE_STATUS_PLAYING ){

        if(newscene.scene === undefined){
          console.log('Error: Scene is undefined. ');

          const newstatus = SCENE_STATUS_COMPLETED;
          console.log('status:',current.status,'=>',newstatus);

          return {
            status: newstatus,
            command: newscene.command,
            scene: [],
            subscription: null
          }
        }
        else if(newscene.scene.length == 0){
          console.log('All scenes have been played. ');

          const newstatus = SCENE_STATUS_COMPLETED;
          console.log('status:',current.status,'=>',newstatus);

          return {
            status: newstatus,
            command: newscene.command,
            scene: [],
            subscription: null
          }
        }
        else
        {
          const newstatus = SCENE_STATUS_PLAYING;
          console.log('status:',current.status,'=>',newstatus);
          return {
            status: newstatus,
            command: newscene.command,
            scene: newscene.scene,
            subscription: playScene()
          }
        }
      }
      else if(newscene.command == SCENE_COMMAND_CANCEL
              && (current.status == SCENE_STATUS_PLAYING
                  || current.status == SCENE_STATUS_PAUSED )){

        console.log('Scene has been canceled');
      
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
      else if(newscene.command == SCENE_COMMAND_FINISH 
        && current.status != SCENE_STATUS_COMPLETED){
        const newstatus = SCENE_STATUS_COMPLETED;
        console.log('status:',current.status,'=>',newstatus);
        current.subscription.unsubscribe();

        return {
          status: newstatus,
          command: newscene.command,
          scene: [],
          subscription: null
        };
      }
      else{
        console.log('invalid command:',newscene.command,',current status:',current.status);
        return current;
      }
    }     
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
        return promise.then(res => {
            if(sceneSubj.getValue().command == SCENE_COMMAND_CANCEL){
              throw new Error();
            }
            return nextword(val.length > 1 ? val[1] : defaultWordDelay, {
              str: val.length > 0 ? val[0] : "",
              interval: val.length > 2 ? val[2] : defaultCharacterDelay
            })
          } 
        )
      }, Promise.resolve())
      .then(() => {
        sceneSubj.next(
          {
            command: SCENE_COMMAND_FINISH,
          });
        sceneSubj.next(
          {
            command: SCENE_COMMAND_PLAY, 
            scene: loadNextScene(), 
            subscription: null
          } as Scene);
      });

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

setTimeout(()=> sceneSubj.next(
    {
      command: SCENE_COMMAND_CANCEL,
    }), 7000);
 