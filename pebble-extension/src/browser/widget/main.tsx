import * as React from 'react';
import { TreeWidget, TreeProps, TreeModel, ContextMenuRenderer, CompositeTreeNode, TreeNode, NodeProps } from "@theia/core/lib/browser";
import { inject, postConstruct } from "inversify";
import { PebbleDocumentNode, PebbleCollectionNode, PebbleConnectionNode, PebbleItemNode, PebbleNode } from '../../classes/node';
import { PebbleCore } from '../core';
import { PebbleAction } from '../../classes/action';
import { PebbleHome } from './home';
import { PebbleToolbar } from './toolbar';

export type PebbleViewWidgetFactory = () => PebbleViewWidget;
export const PebbleViewWidgetFactory = Symbol('PebbleViewWidgetFactory');

export class PebbleViewWidget extends TreeWidget {
  constructor(
    @inject(PebbleCore) protected readonly core: PebbleCore,
    @inject(TreeProps) protected readonly treeProps: TreeProps,
    @inject(TreeModel) model: TreeModel,
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer
  ) {
    super(treeProps, model, contextMenuRenderer);

    this.id = 'pebble-view';
    this.title.label = 'Connections';
    this.title.caption = 'Connections';
    this.title.iconClass = 'fa fa-plug';
    this.title.closable = true;
    this.addClass('pebble-view');
  }
  @postConstruct()
  protected init(): void {
    super.init();
    this.core.model = this.model;
  }
  
  protected isEmpty(model?: TreeModel): boolean {
    model = model || this.model;
    return !model.root || (model.root as CompositeTreeNode).children.length < 2;
  }
  protected button(id: string, text:string, icon: string, action: string | PebbleAction | React.MouseEventHandler<any>, color = ''): React.ReactNode {
    let click: React.MouseEventHandler<any>;
    if (PebbleAction.is(action)) {
      action = action.id;
    }
    if (typeof action === 'string') {
      click = () => this.core.execute(action as string)
    } else {
      click = action.bind(this);
    }
    return <button id={id} className={'pebble-action' + (color ? ' color-' + color : '')} title={text} onClick={click}>
      <span className={'fa fa-fw fa-' + icon}></span>
    </button>;
  }

  protected renderConnection(node: PebbleConnectionNode): React.ReactNode {
    return <div className='pebbleNode connectionNode' title={node.connection.name + ' (' + (node.connection.username || '(guest)') + '@' + node.connection.server + ')'}>
      <i className={this.core.getIcon(node)}></i>
      <span className='name'>{node.connection.name}</span>
      <span className='server'>{node.connection.username || '(guest)'}@{node.connection.server}</span>
    </div>;
  }
  protected renderItem(node: PebbleItemNode): React.ReactNode {
    return node.collection ? this.renderCollection(node as PebbleCollectionNode) : this.renderDocument(node as PebbleDocumentNode);
  }
  protected renderCollection(node: PebbleCollectionNode): React.ReactNode {
    return <div className='pebbleNode itemNode collectionNode'>
      <i className={this.core.getIcon(node)}></i>
      <span className='name'>{node.name}</span>
    </div>;
  }
  protected renderDocument(node: PebbleDocumentNode): React.ReactNode {
    return <div className={'pebbleNode itemNode documentNode' + (node.isNew ? ' pebbleNew' : '')}>
      <i className={this.core.getIcon(node)}></i>
      <span className='name'>{node.name}</span>
    </div>;
  }
  
  protected renderCaption(node: TreeNode, props: NodeProps): React.ReactNode {
    if (PebbleNode.is(node)) {
      console.log('node')
      if (PebbleNode.isConnection(node)) {
        return this.renderConnection(node);
      } else if (PebbleNode.isToolbar(node)) {
        return this.isEmpty(this.model) ? <PebbleHome core={this.core} /> : <PebbleToolbar core={this.core} />;
      } else if (PebbleNode.isItem(node)) {
        return this.renderItem(node);
      }
    }
    console.error('unknown node:', node);
    return '···';
  }
}