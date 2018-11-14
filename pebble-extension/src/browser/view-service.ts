import { WidgetFactory, Widget, SelectableTreeNode, ExpandableTreeNode, CompositeTreeNode } from "@theia/core/lib/browser";
import { injectable, inject } from "inversify";
import { PebbleViewWidget, PebbleViewWidgetFactory } from "./widget";
import { PebbleNode, PebbleConnectionNode, PebbleDocumentNode, PebbleCollectionNode } from "../classes/node";
import { DisposableCollection } from "vscode-ws-jsonrpc";
import { PebbleApi } from "../common/api";
import { PebbleItem, PebbleCollection } from "../classes/item";
import { PebbleConnection } from "../classes/connection";
import { PebbleCore } from "./core";
// import { EditorWidget } from "@theia/editor/lib/browser";

@injectable()
export class PebbleViewService implements WidgetFactory {

  id = 'pebble-view';

  protected widget?: PebbleViewWidget;

  constructor(
    @inject(PebbleCore) protected core: PebbleCore,
    @inject(PebbleViewWidgetFactory) protected factory: PebbleViewWidgetFactory,
  ) { }

  get open(): boolean {
    return this.widget !== undefined && this.widget.isVisible;
  }

  // publish(roots: PebbleNode[]): void {
  //   if (this.core) {
  //     this.core.createRoot(roots);
  //     // this.onDidChangeOutlineEmitter.fire(roots);
  //   }
  // }
  async connect(node: CompositeTreeNode, connection: PebbleConnection) {
    if (!this.widget) {
      return;
    }
    if (this.core.laod(node)) {
      try {
        const result = await PebbleApi.connect(connection);
        (node as PebbleConnectionNode).loaded = true;
        const collection = result as PebbleCollection;
        collection.collections.forEach(subCollection => this.core.addCollection(node, connection, subCollection));
        collection.documents.forEach(document => this.core.addDocument(node, connection, document));
      } catch (e) {
        (node as PebbleConnectionNode).expanded = false;
        console.error(e);
      }
      this.core.unlaod(node);
    }
  }
  
  async load(node: CompositeTreeNode, connection: PebbleConnection, uri: string) {
    if (!this.widget) {
      return;
    }
    if (this.core.laod(node)) {
      try {
        const result = await PebbleApi.load(connection, uri);
        if (PebbleItem.isDocument(result)) {} else {
          (node as PebbleConnectionNode).loaded = true;
          const collection = result as PebbleCollection;
          collection.collections.forEach(subCollection => this.core.addCollection(node, connection, subCollection));
          collection.documents.forEach(document => this.core.addDocument(node, connection, document));
        }
      } catch (e) {
        (node as PebbleConnectionNode).expanded = false;
        console.error(e);
      }
      this.core.unlaod(node);
    }
  }
  
  async onOpen(node: Readonly<any>): Promise<void> {
    if (PebbleNode.isDocument(node as any)) {
      const document = node as PebbleDocumentNode;
      document.editor = await this.core.openDocument(document);
      this.widget && this.widget.model.refresh();
    } else if (PebbleNode.isCollection(node as any)) {
      const collection = node as PebbleCollectionNode;
      collection.expanded = true;
      collection.loaded = false;
      this.core.empty(collection);
      this.onExpansionChanged(collection);
    }
  }
  
  async onExpansionChanged(node: Readonly<ExpandableTreeNode>): Promise<void> {
    if (!this.widget) {
      return;
    }
    if (node.expanded) {
      if (PebbleNode.isConnection(node) && !node.loaded) {
        this.connect(node, node.connection);
      } else if (PebbleNode.isCollection(node) && !node.loaded) {
        this.load(node, node.connection, node.uri || '');
      }
    }
  }
  
  async onSelectionChanges(nodes: ReadonlyArray<Readonly<SelectableTreeNode>>): Promise<void> {
    if (!this.widget) {
      return;
    }
    // this.session.selected = nodes.length > 0 ? nodes[0] : undefined;
    const toolbar = nodes.find(node => PebbleNode.isToolbar(node));
    if (toolbar) {
      this.widget.model.toggleNode(toolbar);
    } else {
      const deleteButton = document.getElementById('pebble-toolbar-button-delete');
      if (deleteButton) {
        const enabled = nodes.length && PebbleNode.isConnection(nodes[0]);
        if (enabled) {
          deleteButton.removeAttribute('disabled');
        } else {
          deleteButton.setAttribute('disabled', 'disabled');
        }
      }
    }
  }

  createWidget(): Promise<Widget> {
    this.widget = this.factory();
    const disposables = new DisposableCollection();
    disposables.push(this.widget.model.onSelectionChanged(this.onSelectionChanges.bind(this)));
    disposables.push(this.widget.model.onOpenNode(this.onOpen.bind(this)));
    disposables.push(this.widget.model.onExpansionChanged(this.onExpansionChanged.bind(this)));
    this.widget.disposed.connect(() => {
      this.widget = undefined;
      disposables.dispose();
    });
    return Promise.resolve(this.widget);
  }
}
