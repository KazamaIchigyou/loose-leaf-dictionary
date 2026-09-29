import json
import os
import shutil

BASE = os.path.dirname(os.path.abspath(__file__))

DIRS = [
    os.path.join(BASE, 'data', 'compounds'),
    os.path.join(BASE, 'data', 'images'),
    os.path.join(BASE, 'data', 'words'),
    os.path.join(BASE, 'data', 'sentences'),
]

BLANK_INDEX = {
    "base_units": [],
    "compounds": [],
    "unit_to_words": {},
    "c2p": {},
    "next_cid": 1,
    "next_pid": 1,
    "next_word_id": 1,
    "next_sentence_id": 1,
    "image_index": {}
}

print('字典数据清空工具')
print('=' * 40)
print('将清空以下内容：')
print('  - data/compounds/ 中的所有文件')
print('  - data/images/ 中的所有文件')
print('  - data/index.json 重置为空白初始状态')
print()

answer = input('确认清空？输入 yes 继续: ')
if answer.strip().lower() != 'yes':
    print('已取消。')
    input('按回车退出...')
    exit()

total = 0
for d in DIRS:
    if not os.path.isdir(d):
        print(f'[跳过] {d}（目录不存在）')
        continue
    files = os.listdir(d)
    for f in files:
        fp = os.path.join(d, f)
        try:
            if os.path.isfile(fp):
                os.remove(fp)
                total += 1
            elif os.path.isdir(fp):
                shutil.rmtree(fp)
                total += 1
        except Exception as e:
            print(f'[失败] {f}: {e}')
    print(f'[完成] {d}（{len(files)} 项）')

index_path = os.path.join(BASE, 'data', 'index.json')
try:
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(BLANK_INDEX, f, ensure_ascii=False, indent=2)
    print('[完成] data/index.json 已重置为空白初始状态')
except Exception as e:
    print(f'[失败] 重置 index.json: {e}')

print('=' * 40)
print(f'共清空 {total} 个文件/目录，data 文件夹已初始化完毕。')
input('按回车退出...')